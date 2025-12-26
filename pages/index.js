export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 16px", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 42, marginBottom: 8 }}>AROC Waste</h1>
      <p style={{ fontSize: 18, lineHeight: 1.5, marginBottom: 24 }}>
        Fast, simple waste collections across Bridgend, Pyle & Porthcawl.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a
          href="/furniture"
          style={{
            display: "inline-block",
            padding: "12px 16px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Furniture collection →
        </a>

        <a
          href="mailto:hello@arocwaste.co.uk"
          style={{
            display: "inline-block",
            padding: "12px 16px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Contact →
        </a>
      </div>
    </main>
  );
}
