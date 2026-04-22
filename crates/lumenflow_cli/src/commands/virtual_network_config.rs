use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct VirtualNetworkConfig {
    #[serde(default = "default_target")]
    pub target: String,
    #[serde(default = "default_rate")]
    pub rate: u32,
    #[serde(default)]
    pub consoles: Vec<ConsoleConfig>,
    #[serde(default)]
    pub nodes: Vec<NodeConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConsoleConfig {
    pub id: String,
    pub name: String,
    pub ip: String,
    #[serde(default = "default_universes")]
    pub universes: u16,
    #[serde(default = "default_pattern")]
    pub pattern: String,
    #[serde(default)]
    pub physical: u8,
    #[serde(default)]
    pub bind: Option<String>,
    #[serde(default)]
    pub sync_target: Option<String>,
    #[serde(default)]
    pub periodic_poll_reply: bool,
    #[serde(default)]
    pub verbose: bool,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub rate: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NodeConfig {
    pub id: String,
    pub name: String,
    pub ip: String,
    #[serde(default = "default_node_port")]
    pub port: u16,
    #[serde(default = "default_profile")]
    pub profile: String,
    #[serde(default)]
    pub periodic_poll_reply: bool,
    #[serde(default)]
    pub verbose: bool,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub ports: Vec<NodePortConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NodePortConfig {
    #[serde(default = "default_port_label")]
    pub label: String,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default = "default_direction")]
    pub direction: String,
    #[serde(default)]
    pub output_sacn: bool,
    #[serde(default)]
    pub input_sacn: bool,
    #[serde(default = "default_merge_mode")]
    pub merge_mode: String,
    #[serde(default)]
    pub rdm_enabled: bool,
    #[serde(default)]
    pub output_style_delta: bool,
    #[serde(default)]
    pub output_short: bool,
    #[serde(default)]
    pub input_errors: bool,
    #[serde(default)]
    pub input_data_received: bool,
    #[serde(default)]
    pub output_data_active: bool,
    #[serde(default)]
    pub universe: Option<u16>,
}

fn default_target() -> String {
    "127.0.0.1".to_string()
}

fn default_rate() -> u32 {
    44
}

fn default_universes() -> u16 {
    8
}

fn default_pattern() -> String {
    "sine".to_string()
}

fn default_node_port() -> u16 {
    6454
}

fn default_profile() -> String {
    "swisson-xnd8".to_string()
}

fn default_port_label() -> String {
    "Port".to_string()
}

fn default_protocol() -> String {
    "dmx512".to_string()
}

fn default_direction() -> String {
    "output".to_string()
}

fn default_merge_mode() -> String {
    "htp".to_string()
}

pub fn load(path: &str) -> Result<VirtualNetworkConfig> {
    let file_path = Path::new(path);
    let raw = fs::read_to_string(file_path)
        .with_context(|| format!("failed to read virtual-network config '{}'", path))?;
    let cfg: VirtualNetworkConfig =
        serde_yaml::from_str(&raw).with_context(|| format!("invalid YAML in '{}'", path))?;
    Ok(cfg)
}

pub fn find_console<'a>(cfg: &'a VirtualNetworkConfig, id: &str) -> Result<&'a ConsoleConfig> {
    cfg.consoles
        .iter()
        .find(|c| c.id == id)
        .with_context(|| format!("console id '{}' not found in config", id))
}

pub fn find_node<'a>(cfg: &'a VirtualNetworkConfig, id: &str) -> Result<&'a NodeConfig> {
    cfg.nodes
        .iter()
        .find(|n| n.id == id)
        .with_context(|| format!("node id '{}' not found in config", id))
}
