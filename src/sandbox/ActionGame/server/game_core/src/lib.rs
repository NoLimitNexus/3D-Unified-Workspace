use serde::{Deserialize, Serialize};

/// A simple 3D vector for position and rotation.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vector3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
    /// Calculates Euclidean distance to another vector.
    pub fn distance(&self, other: &Vector3) -> f32 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2) + (self.z - other.z).powi(2)).sqrt()
    }
    /// Returns a normalized forward vector based on yaw (rotation around Y).
    pub fn get_forward(yaw: f32) -> Self {
        Self::new(yaw.sin(), 0.0, yaw.cos())
    }
    /// Sanitizes the vector by replacing NaN/Infinity with 0.0 and clamping to world bounds.
    pub fn validate(&mut self) {
        if !self.x.is_finite() { self.x = 0.0; }
        if !self.y.is_finite() { self.y = 0.0; }
        if !self.z.is_finite() { self.z = 0.0; }
        // Clamp to world bounds
        self.x = self.x.clamp(-300.0, 300.0);
        self.y = self.y.clamp(-10.0, 300.0);
        self.z = self.z.clamp(-300.0, 300.0);
    }
}

/// Wraps an angle to be within the [-PI, PI] range.
pub fn normalize_angle(mut angle: f32) -> f32 {
    while angle > std::f32::consts::PI { angle -= std::f32::consts::TAU; }
    while angle < -std::f32::consts::PI { angle += std::f32::consts::TAU; }
    angle
}

/// Represents the current physical and visual state of a player.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PlayerState {
    pub id: String,
    pub position: Vector3,
    pub rotation: f32, // Simplified for now
    pub anim: String,
    pub anim_phase: f32,
    pub is_crouching: bool,
    pub is_dead: bool,
    pub health: f32,
    pub punch_time: f32,
    // Customization
    pub height: f32,
    pub width: f32,
    pub muscle: f32,
    pub legs: f32,
    pub skin: String,
    // Combat
    pub current_weapon: i32,
}

impl PlayerState {
    /// Clamps proportions to [0.5, 2.5] and sanitizes strings to prevent exploits or crashes.
    pub fn validate(&mut self) {
        self.position.validate();
        if !self.rotation.is_finite() { self.rotation = 0.0; }
        
        // Clamp customization to realistic bounds
        self.height = self.height.clamp(0.5, 2.5);
        self.width = self.width.clamp(0.5, 2.5);
        self.muscle = self.muscle.clamp(0.5, 2.5);
        self.legs = self.legs.clamp(0.5, 2.5);
        
        // Basic skin hex validation (must start with # and be 7 chars)
        if !self.skin.starts_with('#') || self.skin.len() != 7 {
            self.skin = "#ffdbac".to_string();
        }
        
        // Sanitize string ID/anim
        if self.id.len() > 64 { self.id.truncate(64); }
        if self.anim.len() > 32 { self.anim.truncate(32); }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WaspState {
    pub id: String,
    pub position: Vector3,
    pub rotation: Vector3, // Use Euler angles for simplicity in broadcast
    pub health: f32,
    pub mode: String, // "patrol", "alert", "dead"
    pub waypoint: Vector3,
    pub aggro: bool,
    pub cooldown: f32,
}

impl WaspState {
    pub fn validate(&mut self) {
        self.position.validate();
        self.rotation.validate();
        self.waypoint.validate();
        if !self.health.is_finite() { self.health = 5.0; }
        if self.id.len() > 64 { self.id.truncate(64); }
    }
}

/// All possible messages in the client-server protocol.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum Message {
    // Client -> Server
    /// Inform the server of the player's current kinematic state.
    PlayerUpdate(PlayerState),
    /// Broadcast a change in a Wasp's state (DEPRECATED: Now server-authoritative).
    WaspUpdate(WaspState), 
    /// Perform a one-shot action like shooting or punching.
    Action { name: String, target_id: Option<String> },
    /// Request profile loading for a given username.
    Login(String),

    // Server -> Client
    /// Full snapshot of all entities in the world.
    ServerState {
        players: Vec<PlayerState>,
        wasps: Vec<WaspState>,
    },
    /// Broadcast when a new operator ID connects.
    PlayerJoined(String),
    /// Broadcast when an operator ID disconnects.
    PlayerLeft(String),
    /// Confirm successful login and return the saved profile data.
    LoginSuccess(PlayerState),
    /// Notify the client they have been disconnected (e.g., due to duplicate login).
    Kicked(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector3_distance() {
        let v1 = Vector3::new(0.0, 0.0, 0.0);
        let v2 = Vector3::new(3.0, 4.0, 0.0);
        assert_eq!(v1.distance(&v2), 5.0);
    }

    #[test]
    fn test_normalize_angle() {
        assert!(normalize_angle(0.0).abs() < 0.001);
        assert!((normalize_angle(std::f32::consts::PI + 0.1) + std::f32::consts::PI - 0.1).abs() < 0.001);
        assert!((normalize_angle(-std::f32::consts::PI - 0.1) - std::f32::consts::PI + 0.1).abs() < 0.001);
    }

    #[test]
    fn test_player_validation() {
        let mut p = PlayerState {
            height: 10.0,  // Too high
            width: 0.1,    // Too small
            skin: "red".to_string(), // Invalid hex
            position: Vector3::new(1000.0, f32::NAN, 0.0),
            ..Default::default()
        };
        p.validate();
        assert!(p.height <= 2.5);
        assert!(p.width >= 0.5);
        assert_eq!(p.skin, "#ffdbac");
        assert!(p.position.x <= 300.0);
        assert!(p.position.y == 0.0); // NaN becomes 0.0
    }
}
