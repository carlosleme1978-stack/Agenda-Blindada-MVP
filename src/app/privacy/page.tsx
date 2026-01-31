export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-sm text-gray-500 mb-8">
        Última atualização: __/__/____
      </p>

      <section className="space-y-4">
        <p>
          A <strong>Agenda Blindada</strong> respeita a privacidade dos seus
          utilizadores e protege os dados tratados pela aplicação.
        </p>

        <h2 className="text-xl font-semibold mt-8">1. Dados tratados</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Dados de contacto</li>
          <li>Informações de agendamento</li>
          <li>Mensagens de confirmação via WhatsApp</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">2. Finalidade</h2>
        <p>
          Os dados são utilizados exclusivamente para a prestação do serviço
          de agendamento e comunicação.
        </p>

        <h2 className="text-xl font-semibold mt-8">3. Contacto</h2>
        <p>Email: contato@exemplo.com</p>
      </section>
    </main>
  );
}
