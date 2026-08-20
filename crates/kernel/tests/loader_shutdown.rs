use codetwo_kernel::{async_trait, App, Context, Loader, LoaderConfig, Plugin, PluginResult};
use serde_json::Value;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

struct DisposablePlugin(Arc<AtomicUsize>);

#[async_trait]
impl Plugin for DisposablePlugin {
    fn name(&self) -> &str {
        "disposable"
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let disposed = self.0.clone();
        ctx.effect(move || {
            disposed.fetch_add(1, Ordering::SeqCst);
        });
        Ok(())
    }
}

#[tokio::test]
async fn explicit_shutdown_disposes_every_loader_fork() {
    let app = App::new();
    let disposed = Arc::new(AtomicUsize::new(0));
    let mut registry = codetwo_kernel::PluginRegistry::new();
    let observed = disposed.clone();
    registry.register(move || DisposablePlugin(observed.clone()));
    let mut loader = Loader::new(app.ctx(), registry);
    assert!(loader
        .apply(LoaderConfig::default().enable(["disposable"]))
        .is_empty());
    app.flush().await;

    loader.shutdown();
    app.flush().await;
    assert_eq!(disposed.load(Ordering::SeqCst), 1);
    assert!(loader.entries().iter().all(|entry| !entry.running));
}

#[tokio::test]
async fn dropping_a_loader_also_disposes_its_forks() {
    let app = App::new();
    let disposed = Arc::new(AtomicUsize::new(0));
    let mut registry = codetwo_kernel::PluginRegistry::new();
    let observed = disposed.clone();
    registry.register(move || DisposablePlugin(observed.clone()));
    {
        let mut loader = Loader::new(app.ctx(), registry);
        assert!(loader
            .apply(LoaderConfig::default().enable(["disposable"]))
            .is_empty());
        app.flush().await;
    }
    app.flush().await;
    assert_eq!(disposed.load(Ordering::SeqCst), 1);
}
