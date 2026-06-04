import 'server-only';

export default function ApiDocsPage() {
  return (
    <html>
      <head>
        <title>Officers Mess API</title>
        <meta charSet="utf-8" />
      </head>
      <body style={{ margin: 0 }}>
        <script id="api-reference" data-url="/api/v1/openapi.json" />
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference" async />
      </body>
    </html>
  );
}
