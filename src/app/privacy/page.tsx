export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <article className="policy-panel">
        <p className="checkout-kicker">Privacy Policy</p>
        <h1>Amazon Warehouse Jobs Extensions</h1>
        <p className="policy-updated">Last updated: June 29, 2026</p>

        <section>
          <h2>What We Collect</h2>
          <p>
            The Canada and UK Chrome extensions collect the buyer/contact email and the Amazon job-search email entered
            for paid access. The Amazon job-search email is used to decide which Amazon Jobs account can activate the
            extension.
          </p>
        </section>

        <section>
          <h2>How The Extension Uses Amazon Pages</h2>
          <p>
            The extensions run only on supported Amazon hiring job-search, authentication, and application pages. They
            read page state needed to match job listings, check sign-in status, and continue the booking/application
            flow after paid access is valid.
          </p>
        </section>

        <section>
          <h2>Payments And License Checks</h2>
          <p>
            The extensions communicate with getslotnow.com to check paid access, create checkout sessions, and validate
            access before automation continues. Payments are processed through Dodo hosted checkout. The browser
            extensions do not receive Dodo secrets and do not process card details.
          </p>
        </section>

        <section>
          <h2>Supabase And Server Data</h2>
          <p>
            The backend stores access records in a private Supabase schema. Browser extensions never talk directly to
            Supabase, and Supabase service-role credentials are used only by server-side code.
          </p>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            We do not sell personal data. Data is shared only with service providers required to operate paid access,
            hosted checkout, backend license validation, and infrastructure.
          </p>
        </section>

        <section>
          <h2>Support And Removal Requests</h2>
          <p>
            For access questions, email changes, refunds, or data removal requests, contact support@getslotnow.com.
          </p>
        </section>
      </article>
    </main>
  );
}
