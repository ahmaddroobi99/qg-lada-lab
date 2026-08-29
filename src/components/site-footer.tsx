export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-subtle md:flex-row md:items-center md:justify-between md:px-6">
        <p>Ahmad Hamdan Droobi · MSc Mechanical Engineering · University of Calgary · 2025</p>
        <p className="font-mono text-xs">
          <a
            href="https://github.com/ahmaddroobi99/qg-lada-lab"
            className="text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            qg-lada-lab
          </a>
          {" · "}
          <a
            href="https://github.com/ahmaddroobi99/QG_work"
            className="text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            QG_work
          </a>
        </p>
      </div>
    </footer>
  );
}
