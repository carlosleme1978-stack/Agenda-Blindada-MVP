export default function Page() {
  return (
    <div style={{
      maxWidth: 1200,
      margin: "0 auto",
      padding: "28px 18px 34px",
    }}>
      <div style={{
        opacity: 0.75,
        fontSize: 13,
        marginBottom: 6,
      }}>Financeiro</div>
      <h1 style={{
        margin: 0,
        fontSize: 44,
        letterSpacing: -0.6,
        lineHeight: 1.05,
      }}>Financeiro</h1>

      <div style={{
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
        backdropFilter: "blur(14px)",
      }}>
        <div style={{ opacity: 0.85 }}>Em implementação (V1.0).</div>
      </div>
    </div>
  );
}
