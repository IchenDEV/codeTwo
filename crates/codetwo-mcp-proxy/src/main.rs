use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = codetwo_mcp_proxy::ProxyArgs::parse(env::args().skip(1))?;
    codetwo_mcp_proxy::run_stdio_proxy(&args).await?;
    Ok(())
}
