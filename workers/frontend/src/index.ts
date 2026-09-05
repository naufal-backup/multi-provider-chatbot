// Frontend Worker: serves the static Next.js export from the `assets` binding.
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    // If path has no extension and doesn't end with '/', try adding .html
    if (!path.includes(".") && !path.endsWith("/")) {
      path = path + ".html";
    }

    try {
      const asset = await env.ASSETS.fetch(
        new Request(new URL(path, "http://localhost"), request)
      );
      if (asset.status === 200) {
        return asset;
      }
    } catch {
      // fall through
    }

    // Fallback to index.html for SPA-style routing
    const index = await env.ASSETS.fetch(
      new Request(new URL("/index.html", "http://localhost"), request)
    );
    return index;
  },
} satisfies ExportedHandler;