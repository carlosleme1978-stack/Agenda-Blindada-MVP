"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const supabase = supabaseBrowser;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (!supabase) {
        setMessage("Erro: variáveis de ambiente do Supabase não carregaram (ver Console).");
        return;
      }

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error) {
        console.error("resetPasswordForEmail error:", error);
        setMessage("Erro: " + error.message);
      } else {
        setMessage("Email enviado! Verifique sua caixa de entrada.");
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setMessage("Erro inesperado (veja o Console).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 520 }}>
      <h1>Recuperar senha</h1>

      <form onSubmit={handleReset}>
        <input
          type="email"
          placeholder="Seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, marginBottom: 10, width: "100%" }}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Enviando..." : "Enviar link de recuperação"}
        </button>
      </form>

      {message && <p style={{ marginTop: 20 }}>{message}</p>}
    </div>
  );
}