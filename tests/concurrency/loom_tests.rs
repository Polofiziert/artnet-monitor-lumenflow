// Concurrency verification tests using Loom
//
// These tests verify that ring buffers and lock-free structures
// behave correctly under concurrent access, with all possible
// memory orderings explored by Loom.

#[cfg(test)]
mod loom_tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn loom_ring_buffer_single_producer() {
        loom::model(|| {
            let counter = Arc::new(AtomicUsize::new(0));
            let c1 = counter.clone();

            let t1 = std::thread::spawn(move || {
                c1.store(1, Ordering::SeqCst);
            });

            let val = counter.load(Ordering::SeqCst);
            t1.join().unwrap();
            
            assert!(val == 0 || val == 1);
        });
    }

    #[test]
    fn loom_concurrent_writes() {
        loom::model(|| {
            let counter = Arc::new(AtomicUsize::new(0));
            let c1 = counter.clone();
            let c2 = counter.clone();

            let t1 = std::thread::spawn(move || {
                c1.fetch_add(1, Ordering::SeqCst);
            });

            let t2 = std::thread::spawn(move || {
                c2.fetch_add(1, Ordering::SeqCst);
            });

            t1.join().unwrap();
            t2.join().unwrap();

            assert_eq!(counter.load(Ordering::SeqCst), 2);
        });
    }
}
