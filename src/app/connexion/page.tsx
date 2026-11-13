const MESSAGES: Record<string, string> = {
  "non-autorise": "Cette adresse n'est pas autorisée à accéder à l'application. Demandez à être ajoutée à la liste.",
  etat: "La demande de connexion a expiré ou n'est pas valide. Merci de réessayer.",
  refuse: "La connexion a été annulée.",
  echec: "La connexion a échoué. Merci de réessayer.",
};

export default async function Connexion({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const message = erreur ? (MESSAGES[erreur] ?? MESSAGES.echec) : undefined;
  return (
    <main>
      <h1>Connexion</h1>
      {message && <p role="alert">{message}</p>}
      <a
        href="/api/auth/google"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          minWidth: 44,
          padding: "0 20px",
          borderRadius: 12,
          background: "#1d1b26",
          color: "#fff",
          textDecoration: "none",
        }}
      >
        Se connecter avec Google
      </a>
    </main>
  );
}
