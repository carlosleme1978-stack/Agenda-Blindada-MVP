export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
      <p className="text-sm text-gray-500 mb-8">
        Última atualização: __/__/____
      </p>

      <section className="space-y-4">
        <p>
          Ao utilizar a <strong>Agenda Blindada</strong>, o utilizador concorda
          com os presentes termos.
        </p>

        <h2 className="text-xl font-semibold mt-8">1. Uso do serviço</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Uso legal e autorizado</li>
          <li>Proibição de spam</li>
          <li>Responsabilidade do cliente sobre o conteúdo</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">2. WhatsApp</h2>
        <p>
          O uso da API do WhatsApp está sujeito às políticas da Meta.
        </p>npm run dev


        <h2 className="text-xl font-semibold mt-8">3. Encerramento</h2>
        <p>
          Contas podem ser suspensas em caso de uso indevido.
        </p>
      </section>
    </main>
  );
}
