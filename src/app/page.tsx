import { appBasePath } from "@/lib/config";

function href(path: string): string {
  return `${appBasePath()}${path}`;
}

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-panel" aria-labelledby="home-title">
        <p className="checkout-kicker">Extension Usage Tracker</p>
        <h1 id="home-title">Booking Access</h1>
        <p className="checkout-copy">
          Choose the payment page for the Amazon warehouse jobs extension you want to activate.
        </p>
        <div className="home-links">
          <a href={href("/checkout/amazon-warehouse-jobs-canada?plan=credits")}>Canada 30-Day Access</a>
          <a href={href("/checkout/amazon-warehouse-jobs-canada?plan=pro")}>Canada Pro Annual</a>
          <a href={href("/checkout/amazon-warehouse-jobs-uk?plan=credits")}>UK 30-Day Access</a>
          <a href={href("/checkout/amazon-warehouse-jobs-uk?plan=pro")}>UK Pro Annual</a>
        </div>
      </section>
    </main>
  );
}
