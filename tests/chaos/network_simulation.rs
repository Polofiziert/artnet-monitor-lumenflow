// Chaos engineering tests for network simulation
//
// These tests simulate real-world network conditions:
// - Packet loss (5-20%)
// - Out-of-order delivery
// - Jitter (1ms - 500ms delays)
// - Duplicate packets

use std::collections::VecDeque;

pub struct ChaosProxy {
    /// Drop rate as percentage (0-100)
    pub drop_rate: u8,
    
    /// Jitter range in milliseconds
    pub jitter_ms: (u32, u32),
    
    /// Enable out-of-order delivery
    pub enable_reorder: bool,
    
    /// Buffer for reordering simulation
    out_of_order_buffer: VecDeque<Vec<u8>>,
}

impl ChaosProxy {
    pub fn new() -> Self {
        Self {
            drop_rate: 0,
            jitter_ms: (1, 500),
            enable_reorder: false,
            out_of_order_buffer: VecDeque::new(),
        }
    }

    /// Simulate packet processing with chaos
    pub fn process_packet(&mut self, packet: Vec<u8>) -> Option<Vec<u8>> {
        // Simulate packet drop
        if should_drop(self.drop_rate) {
            return None;
        }

        // Simulate reordering
        if self.enable_reorder && should_reorder() {
            self.out_of_order_buffer.push_back(packet);
            return self.out_of_order_buffer.pop_front();
        }

        Some(packet)
    }

    /// Get simulated jitter value in milliseconds
    pub fn get_jitter_ms(&self) -> u32 {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        rng.gen_range(self.jitter_ms.0..=self.jitter_ms.1)
    }
}

fn should_drop(drop_rate: u8) -> bool {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    rng.gen_range(0..100) < drop_rate
}

fn should_reorder() -> bool {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    rng.gen_bool(0.1) // 10% chance to reorder
}

#[cfg(test)]
mod chaos_tests {
    use super::*;

    #[test]
    fn test_chaos_proxy_drop_simulation() {
        let mut proxy = ChaosProxy::new();
        proxy.drop_rate = 50;
        
        let packet = vec![0x41, 0x72, 0x74, 0x2d]; // "Art-"
        
        let mut dropped = 0;
        let mut passed = 0;
        
        for _ in 0..100 {
            match proxy.process_packet(packet.clone()) {
                Some(_) => passed += 1,
                None => dropped += 1,
            }
        }
        
        // With 50% drop rate, expect roughly 50 dropped, 50 passed
        assert!(dropped > 30 && dropped < 70);
        assert!(passed > 30 && passed < 70);
    }

    #[test]
    fn test_jitter_injection() {
        let proxy = ChaosProxy::new();
        
        for _ in 0..10 {
            let jitter = proxy.get_jitter_ms();
            assert!(jitter >= proxy.jitter_ms.0 && jitter <= proxy.jitter_ms.1);
        }
    }

    #[test]
    fn test_ui_jitter_warning() {
        // Verify UI correctly computes flicker score from high jitter
        let jitter_values = vec![150, 200, 250, 300]; // ms
        let flicker_score = compute_flicker_score(&jitter_values);
        
        // High jitter should result in amber warning (>0.7 score)
        assert!(flicker_score > 0.7);
    }
}

fn compute_flicker_score(jitter_values: &[u32]) -> f32 {
    if jitter_values.is_empty() {
        return 0.0;
    }
    
    let mean = jitter_values.iter().sum::<u32>() as f32 / jitter_values.len() as f32;
    let variance = jitter_values
        .iter()
        .map(|v| {
            let diff = *v as f32 - mean;
            diff * diff
        })
        .sum::<f32>()
        / jitter_values.len() as f32;
    
    // Normalize to 0-1 range
    (variance / 100_000.0).min(1.0)
}
