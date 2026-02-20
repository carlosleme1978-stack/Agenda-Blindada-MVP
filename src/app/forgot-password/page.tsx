"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      // Mostra exatamente o que está faltando
      console.error("ENV missing:", {
        NEXT_PUBLIC_SUPABASE_URL: url ? "OK" : "MISSING",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anon ? "OK" : "MISSING",
      });
      return null;
    }
    return createClient(url, anon);
  }, []);

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