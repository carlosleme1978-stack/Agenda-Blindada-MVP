import { Suspense } from "react";

function SignupClient() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Crie sua conta</h1>
      <form>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input id="email" name="email" type="email" />
        </div>
        <div style={{ marginTop: 8 }}>
          <label htmlFor="password">Senha</label>
          <br />
          <input id="password" name="password" type="password" />
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit">Criar conta</button>
        </div>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <SignupClient />
    </Suspense>
  );
}