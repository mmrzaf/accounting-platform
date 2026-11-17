# Outbound AI HTTP proxy

The local accounting server does **not** need an internet connection for core business operations. Only the optional AI provider request needs external access. To route those requests through an HTTP CONNECT proxy, configure the installation's private `.env` file:

```dotenv
APP_AI_PROXY_URL=http://127.0.0.1:1080
```

Restart `pnpm run app:serve` after changing `.env`. Keep the provider's Groq settings in **Settings → AI**:

- Base URL: `https://api.groq.com/openai/v1`
- Model: a Groq model with tool calling, e.g. `openai/gpt-oss-120b`
- API key: your Groq API key (stored encrypted by the application)

The proxy setting belongs to the **server**, not to individual company accounts, React, or the browser. It is used only for outbound AI provider HTTP requests; login, SQLite, local server routes, and the React client are unaffected. No change to `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_USE_ENV_PROXY`, a global HTTP agent, or additional npm packages is required.

The proxy must support **HTTP CONNECT** for HTTPS destinations. A listener on port `1080` may actually be SOCKS5; that is a different protocol. If your proxy offers both, select its HTTP/mixed port. Only plain `http://` proxy URLs without embedded credentials are currently supported; the TLS connection from the application to Groq is still verified normally inside the tunnel. The proxy sees the destination host but cannot read the Groq API key or financial payload under normal TLS operation.

To check the local proxy independently:

```sh
curl --proxy http://127.0.0.1:1080 -v https://api.groq.com/openai/v1/models -o /dev/null
```

An HTTP 401 from Groq without a bearer token is normal for that diagnostic. Look for `HTTP/1.1 200 Connection established` in curl's verbose output. A proxy connection refusal or a SOCKS/HTTP protocol mismatch means you need to correct the local proxy configuration. Do not disable TLS certificate validation to work around a proxy error.

Remove the variable (or comment it out) to use direct AI requests. Restart the server for either change. Do not place API keys or proxy credentials in logs, committed files, or URLs.
