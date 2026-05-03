use game_core::{Message, PlayerState, Vector3, WaspState};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use serde_json;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::time::interval;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message as WsMessage, WebSocketStream};
use rand::Rng;
use rusqlite::{params, Connection};

type Clients = Arc<Mutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, WsMessage>>>>;
type GameState = Arc<Mutex<State>>;

struct State {
    players: HashMap<String, PlayerState>,
    wasps: HashMap<String, WaspState>,
    tick_count: u64,
    db: Arc<Mutex<Connection>>,
}

#[tokio::main]
async fn main() {
    let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).await.expect("Failed to bind");
    println!("Listening on: {}", addr);

    // Initialize Database
    let conn = Connection::open("players.db").expect("Failed to open database");
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
    ).expect("Failed to create table");
    let db = Arc::new(Mutex::new(conn));

    let clients: Clients = Arc::new(Mutex::new(HashMap::new()));
    let game_state = Arc::new(Mutex::new(State {
        players: HashMap::new(),
        wasps: HashMap::new(),
        tick_count: 0,
        db,
    }));

    // Initialize 10 WASPs on the server
    {
        let mut rng = rand::thread_rng();
        let mut state_lock = game_state.lock().await;
        for i in 0..10 {
            let id = format!("wasp_{}", i);
            let pos = Vector3::new(
                rng.gen_range(-40.0..40.0),
                6.0,
                rng.gen_range(-40.0..40.0),
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
        let mut tick_interval = interval(Duration::from_millis(50)); // 20Hz
        loop {
            tick_interval.tick().await;
            update_game_world(&tick_state).await;
            broadcast_state(&tick_clients, &tick_state).await;
        }
    });

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, clients.clone(), game_state.clone()));
    }
}

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
                
                let turn_rate = 3.5 * delta;
                wasp.rotation.y += diff.clamp(-turn_rate, turn_rate);
                
                let angle_penalty = diff.abs().min(1.0);
                let current_speed = (6.0 - angle_penalty * 4.0).max(2.5);

                if nearest_dist > 8.0 {
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
                    rng.gen_range(-50.0..50.0),
                    6.0,
                    rng.gen_range(-50.0..50.0),
                );
            }

            let dir_x = wasp.waypoint.x - wasp.position.x;
            let dir_z = wasp.waypoint.z - wasp.position.z;
            let target_yaw = dir_x.atan2(dir_z);
            
            let diff = normalize_angle(target_yaw - wasp.rotation.y);
            let turn_rate = 2.0 * delta; 
            wasp.rotation.y += diff.clamp(-turn_rate, turn_rate);

            let angle_penalty = diff.abs().min(1.0);
            let current_speed = (4.0 - angle_penalty * 2.0).max(1.5);

            let move_x = wasp.rotation.y.sin();
            let move_z = wasp.rotation.y.cos();
            wasp.position.x += move_x * current_speed * delta;
            wasp.position.z += move_z * current_speed * delta;
        }

        let bob = (t * 2.5).sin() * 0.3;
        wasp.position.y = 6.0 + bob;
    }
}

fn normalize_angle(mut angle: f32) -> f32 {
    while angle > std::f32::consts::PI { angle -= std::f32::consts::TAU; }
    while angle < -std::f32::consts::PI { angle += std::f32::consts::TAU; }
    angle
}

async fn broadcast_state(clients: &Clients, state: &GameState) {
    let current_state = {
        let state_lock = state.lock().await;
        Message::ServerState {
            players: state_lock.players.values().cloned().collect(),
            wasps: state_lock.wasps.values().cloned().collect(),
        }
    };

    let json_msg = serde_json::to_string(&current_state).unwrap();
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

async fn handle_connection(stream: TcpStream, clients: Clients, state: GameState) {
    let peer_addr = match stream.peer_addr() {
        Ok(addr) => addr.to_string(),
        Err(_) => return,
    };

    let ws_stream = match accept_async(stream).await {
        Ok(s) => s,
        Err(e) => {
            println!("Error during WebSocket handshake from {}: {}", peer_addr, e);
            return;
        }
    };
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    println!("New connection attempt from {}", peer_addr);

    let mut player_id = String::new();

    // 1. Wait for Login Message
    while let Some(msg) = ws_receiver.next().await {
        if let Ok(WsMessage::Text(text)) = msg {
            if let Ok(Message::Login(username)) = serde_json::from_str::<Message>(&text) {
                println!("Login attempt: {}", username);
                player_id = username.clone();
                
                // Load or Create Profile
                let mut profile = PlayerState {
                    id: player_id.clone(),
                    skin: "#ffdbac".to_string(),
                    height: 1.0,
                    width: 1.0,
                    legs: 1.0,
                    muscle: 1.0,
                    ..Default::default()
                };

                {
                    let state_lock = state.lock().await;
                    let db_lock = state_lock.db.lock().await;
                    let mut stmt = db_lock.prepare("SELECT skin, height, width, legs, muscle FROM players WHERE username = ?").unwrap();
                    let mut rows = stmt.query(params![player_id]).unwrap();
                    
                    if let Some(row) = rows.next().unwrap() {
                        profile.skin = row.get(0).unwrap();
                        profile.height = row.get(1).unwrap();
                        profile.width = row.get(2).unwrap();
                        profile.legs = row.get(3).unwrap();
                        profile.muscle = row.get(4).unwrap();
                        println!("Loaded existing profile for {}", player_id);
                    } else {
                        // Create new record
                        db_lock.execute(
                            "INSERT INTO players (username, skin, height, width, legs, muscle) VALUES (?, ?, ?, ?, ?, ?)",
                            params![player_id, profile.skin, profile.height, profile.width, profile.legs, profile.muscle],
                        ).unwrap();
                        println!("Created new profile for {}", player_id);
                    }
                }

                // Send LoginSuccess
                let success_msg = Message::LoginSuccess(profile.clone());
                ws_sender.send(WsMessage::Text(serde_json::to_string(&success_msg).unwrap())).await.ok();
                
                // Add to world
                {
                    let mut state_lock = state.lock().await;
                    state_lock.players.insert(player_id.clone(), profile);
                }
                break;
            }
        }
    }

    if player_id.is_empty() { return; }

    // Add to clients
    {
        let mut clients_lock = clients.lock().await;
        clients_lock.insert(player_id.clone(), ws_sender);
    }

    println!("Player {} fully joined", player_id);

    while let Some(msg) = ws_receiver.next().await {
        if let Ok(WsMessage::Text(text)) = msg {
            if let Ok(incoming) = serde_json::from_str::<Message>(&text) {
                match incoming {
                    Message::PlayerUpdate(p) => {
                        let mut state_lock = state.lock().await;
                        let mut updated_p = p.clone();
                        updated_p.id = player_id.clone();
                        state_lock.players.insert(player_id.clone(), updated_p);
                    }
                    Message::Action { name, target_id } => {
                        // Relay action to other clients
                        let mut clients_lock = clients.lock().await;
                        let action_msg = Message::Action { name, target_id };
                        let json = serde_json::to_string(&action_msg).unwrap();
                        for (id, sender) in clients_lock.iter_mut() {
                            if id != &player_id {
                                sender.send(WsMessage::Text(json.clone())).await.ok();
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // Handle disconnect & Save
    {
        let mut state_lock = state.lock().await;
        if let Some(p) = state_lock.players.remove(&player_id) {
            let db_lock = state_lock.db.lock().await;
            db_lock.execute(
                "UPDATE players SET skin = ?, height = ?, width = ?, legs = ?, muscle = ? WHERE username = ?",
                params![p.skin, p.height, p.width, p.legs, p.muscle, player_id],
            ).unwrap();
        }
        let mut clients_lock = clients.lock().await;
        clients_lock.remove(&player_id);
    }
    println!("Player {} left and saved", player_id);
}
