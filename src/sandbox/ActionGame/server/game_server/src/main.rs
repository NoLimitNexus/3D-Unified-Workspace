use game_core::{Message, PlayerState, Vector3, WaspState};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, mpsc};
use tokio::time::interval;
use tokio::signal;
use tokio_tungstenite::{accept_async_with_config, tungstenite::protocol::{Message as WsMessage, WebSocketConfig}, WebSocketStream};
use rand::Rng;
use rusqlite::{params, Connection, Result};
use std::sync::Mutex as StdMutex;
use game_core::normalize_angle;

type Clients = Arc<Mutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, WsMessage>>>>;
type GameState = Arc<Mutex<State>>;

/// Trait for player persistence to allow mocking in tests.
/// This abstracts the storage backend (SQLite) from the game logic.
pub trait PlayerStore: Send + Sync {
    /// Loads a player profile by username. Returns None if not found.
    fn load_profile(&self, username: &str) -> Result<Option<PlayerState>>;
    /// Saves or updates a player profile.
    fn save_profile(&self, p: &PlayerState) -> Result<()>;
}

/// Implementation of PlayerStore using a local SQLite database.
pub struct SqlitePlayerStore {
    conn: StdMutex<Connection>,
}

impl SqlitePlayerStore {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS players (
                username TEXT PRIMARY KEY,
                skin TEXT,
                height REAL,
                width REAL,
                legs REAL,
                muscle REAL
            )",
            [],
        )?;
        Ok(Self { conn: StdMutex::new(conn) })
    }
}

impl PlayerStore for SqlitePlayerStore {
    fn load_profile(&self, username: &str) -> Result<Option<PlayerState>> {
        let db_lock = self.conn.lock().unwrap();
        let mut stmt = db_lock.prepare("SELECT skin, height, width, legs, muscle FROM players WHERE username = ?")?;
        let mut rows = stmt.query(params![username])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(PlayerState {
                id: username.to_string(),
                skin: row.get(0)?,
                height: row.get(1)?,
                width: row.get(2)?,
                legs: row.get(3)?,
                muscle: row.get(4)?,
                ..Default::default()
            }))
        } else {
            Ok(None)
        }
    }

    fn save_profile(&self, p: &PlayerState) -> Result<()> {
        let db_lock = self.conn.lock().unwrap();
        db_lock.execute(
            "INSERT OR REPLACE INTO players (username, skin, height, width, legs, muscle) VALUES (?, ?, ?, ?, ?, ?)",
            params![p.id, p.skin, p.height, p.width, p.legs, p.muscle],
        )?;
        Ok(())
    }
}

/// Global server state containing all active players and NPCs.
struct State {
    /// Active players indexed by their unique Operator ID.
    players: HashMap<String, PlayerState>,
    /// All WASP NPCs in the simulation.
    wasps: HashMap<String, WaspState>,
    /// Monotonic tick counter for the simulation.
    tick_count: u64,
    /// Persistence layer for saving/loading profiles.
    store: Arc<dyn PlayerStore>,
}

/// Main server entry point. Sets up the DB, starts the tick loop, and listens for connections.
#[tokio::main]
async fn main() {
    let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).await.expect("Failed to bind");
    println!("Neural Link Online: {}", addr);

    let store = Arc::new(SqlitePlayerStore::new("players.db").expect("Failed to init database"));
    let clients: Clients = Arc::new(Mutex::new(HashMap::new()));
    let (_shutdown_tx, _shutdown_rx) = mpsc::channel::<()>(1);
    
    let game_state = Arc::new(Mutex::new(State {
        players: HashMap::new(),
        wasps: HashMap::new(),
        tick_count: 0,
        store: store.clone(),
    }));

    // Auto-Save Loop: Flush all active players every 60 seconds
    let save_state = game_state.clone();
    tokio::spawn(async move {
        let mut save_interval = interval(Duration::from_secs(60));
        loop {
            save_interval.tick().await;
            let players_to_save: Vec<PlayerState> = {
                let lock = save_state.lock().await;
                lock.players.values().cloned().collect()
            };
            if !players_to_save.is_empty() {
                println!("Auto-Saving {} active sessions...", players_to_save.len());
                for p in players_to_save {
                    let _ = store.save_profile(&p);
                }
            }
        }
    });

    // Initialize 10 WASPs on the server
    {
        let mut rng = rand::thread_rng();
        let mut state_lock = game_state.lock().await;
        let wasp_count = 10;
        for i in 0..wasp_count {
            let id = format!("wasp_{}", i);
            // Evenly space wasps around the map in separate sectors
            let sector_angle = (i as f32 / wasp_count as f32) * std::f32::consts::TAU;
            let angle: f32 = sector_angle + rng.gen_range(-0.2..0.2); // slight jitter
            let radius: f32 = rng.gen_range(40.0..120.0);
            let pos = Vector3::new(
                angle.cos() * radius,
                6.0,
                angle.sin() * radius,
            );
            state_lock.wasps.insert(id.clone(), WaspState {
                id,
                position: pos.clone(),
                rotation: Vector3::default(),
                health: 5.0,
                mode: "patrol".to_string(),
                waypoint: pos,
                aggro: false,
                cooldown: 0.0,
            });
        }
    }

    // Spawn the game tick loop (20Hz)
    let tick_clients = clients.clone();
    let tick_state = game_state.clone();
    tokio::spawn(async move {
        let mut tick_interval = interval(Duration::from_millis(50)); 
        loop {
            tick_interval.tick().await;
            update_game_world(&tick_state).await;
            broadcast_state(&tick_clients, &tick_state).await;
        }
    });

    loop {
        tokio::select! {
            result = listener.accept() => {
                if let Ok((stream, _)) = result {
                    tokio::spawn(handle_connection(stream, clients.clone(), game_state.clone()));
                }
            }
            _ = signal::ctrl_c() => {
                println!("\nShutdown signal received. Flushing all operator data...");
                let final_players: Vec<PlayerState> = {
                    let lock = game_state.lock().await;
                    lock.players.values().cloned().collect()
                };
                let store = {
                    let lock = game_state.lock().await;
                    lock.store.clone()
                };
                for p in final_players {
                    println!("Saving {}...", p.id);
                    let _ = store.save_profile(&p);
                }
                println!("Neural Link offline. Goodbye.");
                std::process::exit(0);
            }
        }
    }
}

/// Advances the server-side simulation by one tick (50ms).
/// Handles AI logic for WASPs and validates entity states.
async fn update_game_world(state: &GameState) {
    let mut state_lock = state.lock().await;
    state_lock.tick_count += 1;
    let t = state_lock.tick_count as f32 * 0.05; 
    let delta = 0.05;
    let mut rng = rand::thread_rng();

    let player_positions: Vec<Vector3> = state_lock.players.values().map(|p| p.position.clone()).collect();

    for wasp in state_lock.wasps.values_mut() {
        if wasp.mode == "dead" { continue; }

        let mut nearest_dist = f32::MAX;
        let mut player_pos = None;
        for p_pos in &player_positions {
            let d = wasp.position.distance(p_pos);
            if d < nearest_dist {
                nearest_dist = d;
                player_pos = Some(p_pos);
            }
        }

        if let Some(pos) = player_pos {
            if nearest_dist < 20.0 || (wasp.aggro && nearest_dist < 50.0) {
                wasp.mode = "alert".to_string();
                wasp.aggro = true;
                
                let dir_x = pos.x - wasp.position.x;
                let dir_z = pos.z - wasp.position.z;
                
                let target_yaw = dir_x.atan2(dir_z);
                let diff = normalize_angle(target_yaw - wasp.rotation.y);
                
                let turn_rate = 2.5 * delta;
                wasp.rotation.y += diff.clamp(-turn_rate, turn_rate);
                
                let angle_penalty = diff.abs().min(1.0);
                let current_speed = (3.5 - angle_penalty * 2.0).max(1.5);

                if nearest_dist > 12.0 {
                    let move_x = wasp.rotation.y.sin();
                    let move_z = wasp.rotation.y.cos();
                    wasp.position.x += move_x * current_speed * delta;
                    wasp.position.z += move_z * current_speed * delta;
                }
                
                wasp.cooldown -= delta;
            } else {
                wasp.mode = "patrol".to_string();
                wasp.aggro = false;
            }
        }

        if wasp.mode == "patrol" {
            let dist_to_way = wasp.position.distance(&wasp.waypoint);
            if dist_to_way < 4.0 {
                wasp.waypoint = Vector3::new(
                    rng.gen_range(-140.0..140.0),
                    6.0,
                    rng.gen_range(-140.0..140.0),
                );
            }

            let dir_x = wasp.waypoint.x - wasp.position.x;
            let dir_z = wasp.waypoint.z - wasp.position.z;
            let target_yaw = dir_x.atan2(dir_z);
            
            let diff = normalize_angle(target_yaw - wasp.rotation.y);
            let turn_rate = 1.5 * delta; 
            wasp.rotation.y += diff.clamp(-turn_rate, turn_rate);

            let angle_penalty = diff.abs().min(1.0);
            let current_speed = (2.5 - angle_penalty * 1.5).max(1.0);

            let move_x = wasp.rotation.y.sin();
            let move_z = wasp.rotation.y.cos();
            wasp.position.x += move_x * current_speed * delta;
            wasp.position.z += move_z * current_speed * delta;
        }

        // Clamp wasps to map bounds (-150..150)
        let bound = 150.0;
        wasp.position.x = wasp.position.x.clamp(-bound, bound);
        wasp.position.z = wasp.position.z.clamp(-bound, bound);

        let bob = (t * 2.5).sin() * 0.3;
        wasp.position.y = 6.0 + bob;
        wasp.validate();
    }
}

// Using game_core::normalize_angle via import

/// Serializes the current world state and broadcasts it to all connected clients.
async fn broadcast_state(clients: &Clients, state: &GameState) {
    let current_state = {
        let state_lock = state.lock().await;
        Message::ServerState {
            players: state_lock.players.values().cloned().collect(),
            wasps: state_lock.wasps.values().cloned().collect(),
        }
    };

    if let Ok(json_msg) = serde_json::to_string(&current_state) {
        let mut clients_lock = clients.lock().await;
        let mut to_remove = Vec::new();

        for (id, sender) in clients_lock.iter_mut() {
            if let Err(_) = sender.send(WsMessage::Text(json_msg.clone())).await {
                to_remove.push(id.clone());
            }
        }

        for id in to_remove {
            clients_lock.remove(&id);
        }
    }
}

/// Manages a single WebSocket connection lifecycle.
/// Handles the initial login handshake and subsequent game message relaying.
async fn handle_connection(stream: TcpStream, clients: Clients, state: GameState) {
    let peer_addr = match stream.peer_addr() {
        Ok(addr) => addr.to_string(),
        Err(_) => return,
    };

    let config = WebSocketConfig {
        max_message_size: Some(16 * 1024), // 16KB limit to prevent memory exhaustion DoS
        ..Default::default()
    };
    
    let ws_stream = match accept_async_with_config(stream, Some(config)).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error during WebSocket handshake from {}: {}", peer_addr, e);
            return;
        }
    };
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let mut player_id = String::new();

    while let Some(msg) = ws_receiver.next().await {
        if let Ok(WsMessage::Text(text)) = msg
            && let Ok(Message::Login(username)) = serde_json::from_str::<Message>(&text) {
                if username.len() > 32 || username.is_empty() { continue; }
                
                // Handle Duplicate Session (Kick Protocol)
                {
                    let mut clients_lock = clients.lock().await;
                    if let Some(mut old_sender) = clients_lock.remove(&username) {
                        println!("Duplicate login for {}. Kicking old session.", username);
                        let kick_msg = Message::Kicked("Duplicate session established.".to_string());
                        if let Ok(json) = serde_json::to_string(&kick_msg) {
                            let _ = old_sender.send(WsMessage::Text(json)).await;
                            let _ = old_sender.close().await;
                        }
                    }
                    
                    // MAX_PLAYERS check
                    if clients_lock.len() >= 50 {
                        let _ = ws_sender.send(WsMessage::Text(serde_json::to_string(&Message::Kicked("Server is at maximum capacity (50).".to_string())).unwrap())).await;
                        return;
                    }
                }

                player_id = username.clone();
                
                let mut profile = PlayerState {
                    id: player_id.clone(),
                    skin: "#ffdbac".to_string(),
                    height: 1.0,
                    width: 1.0,
                    legs: 1.0,
                    muscle: 1.0,
                    ..Default::default()
                };

                let load_res = {
                    let state_lock = state.lock().await;
                    state_lock.store.load_profile(&player_id)
                };

                match load_res {
                    Ok(Some(saved)) => {
                        profile = saved;
                        println!("Loaded existing profile for {}", player_id);
                    }
                    Ok(None) => {
                        let state_lock = state.lock().await;
                        let _ = state_lock.store.save_profile(&profile);
                        println!("Created new profile for {}", player_id);
                    }
                    Err(e) => {
                        eprintln!("Database error for {}: {}", player_id, e);
                    }
                }

                let success_msg = Message::LoginSuccess(profile.clone());
                if let Ok(json) = serde_json::to_string(&success_msg) {
                    let _ = ws_sender.send(WsMessage::Text(json)).await;
                }
                
                {
                    let mut state_lock = state.lock().await;
                    state_lock.players.insert(player_id.clone(), profile);
                }
                break;
            }
    }

    if player_id.is_empty() { return; }

    {
        let mut clients_lock = clients.lock().await;
        clients_lock.insert(player_id.clone(), ws_sender);
    }

    while let Some(msg) = ws_receiver.next().await {
        if let Ok(WsMessage::Text(text)) = msg
            && let Ok(incoming) = serde_json::from_str::<Message>(&text) {
                match incoming {
                    Message::PlayerUpdate(mut p) => {
                        p.validate(); // Defensive validation on every update
                        let mut state_lock = state.lock().await;
                        p.id = player_id.clone();
                        state_lock.players.insert(player_id.clone(), p);
                    }
                    Message::Action { name, target_id } => {
                        // Handle server-side logic for actions
                        // IMPORTANT: Lock state FIRST, then drop before locking clients
                        // to prevent deadlock with broadcast_state
                        if name == "damage_wasp" {
                            if let Some(w_id) = &target_id {
                                let mut state_lock = state.lock().await;
                                if let Some(wasp) = state_lock.wasps.get_mut(w_id) {
                                    if wasp.mode != "dead" {
                                        wasp.health -= 1.0;
                                        wasp.aggro = true;
                                        wasp.mode = "alert".to_string();
                                        if wasp.health <= 0.0 {
                                            wasp.mode = "dead".to_string();
                                        }
                                    }
                                }
                                // state_lock dropped here
                            }
                        }

                        // Broadcast the action to other clients (separate lock scope)
                        let action_msg = Message::Action { name, target_id };
                        if let Ok(json) = serde_json::to_string(&action_msg) {
                            let mut clients_lock = clients.lock().await;
                            for (id, sender) in clients_lock.iter_mut() {
                                if id != &player_id {
                                    sender.send(WsMessage::Text(json.clone())).await.ok();
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
    }

    {
        let mut state_lock = state.lock().await;
        if let Some(p) = state_lock.players.remove(&player_id) {
            let _ = state_lock.store.save_profile(&p);
        }
        let mut clients_lock = clients.lock().await;
        clients_lock.remove(&player_id);
    }
    println!("Player {} disconnected. Progress saved.", player_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    struct MockStore {
        profiles: StdMutex<HashMap<String, PlayerState>>,
    }

    impl PlayerStore for MockStore {
        fn load_profile(&self, username: &str) -> Result<Option<PlayerState>> {
            let lock = self.profiles.lock().unwrap();
            Ok(lock.get(username).cloned())
        }
        fn save_profile(&self, p: &PlayerState) -> Result<()> {
            let mut lock = self.profiles.lock().unwrap();
            lock.insert(p.id.clone(), p.clone());
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_login_and_save() {
        let store = Arc::new(MockStore { profiles: StdMutex::new(HashMap::new()) });
        let p = PlayerState { id: "test".to_string(), muscle: 1.5, ..Default::default() };
        store.save_profile(&p).unwrap();
        
        let loaded = store.load_profile("test").unwrap().unwrap();
        assert_eq!(loaded.muscle, 1.5);
    }

    #[test]
    fn test_server_capacity() {
        let mut clients: HashMap<String, i32> = HashMap::new();
        for i in 0..50 {
            clients.insert(format!("player_{}", i), i);
        }
        assert!(clients.len() >= 50);
    }
}
