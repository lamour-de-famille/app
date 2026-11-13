/** État affiché quand la base ou la famille n'est pas configurée : aucune donnée de repli. */
export default function NonConfigure() {
  return (
    <main className="contenu">
      <h1>Application non configurée</h1>
      <p role="alert">
        L&apos;application n&apos;est pas encore prête : la famille n&apos;est pas configurée en base. Prévenez la personne qui
        administre l&apos;application.
      </p>
    </main>
  );
}
