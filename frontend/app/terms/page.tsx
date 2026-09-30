import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Page() {
  return (
    <LegalPage title="Terms of Service" updated="30 September 2026">
      <section>
        <h2>What SOV-OPT is</h2>
        <p>
          SOV-OPT is optimization software under active development for Smart India Hackathon 2026, problem statement 26119,
          posed by Mangalore Refinery and Petrochemicals Limited. It reads mathematical optimization models, solves them and
          reports verified results.
        </p>
      </section>
      <section>
        <h2>Current status</h2>
        <p>
          This is a development build. Some solver components are still being connected, and results should be checked
          independently before they inform operational decisions. Each run records the engine that produced it in its
          passport.
        </p>
      </section>
      <section>
        <h2>Your models</h2>
        <p>
          You keep whatever rights you have in the models you upload. Upload only models you are permitted to share with the
          operator of this installation. Public benchmark instances remain under the terms set by their original publishers.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not upload files that are not optimization models or that you are not allowed to process.</li>
          <li>Do not attempt to disrupt the service or access data belonging to other users of the installation.</li>
        </ul>
      </section>
      <section>
        <h2>Warranty and liability</h2>
        <p>
          The team has not yet set warranty or liability terms. These are <em>to be decided</em> before any production or
          commercial use.
        </p>
      </section>
      <section>
        <h2>Source code and license</h2>
        <p>
          The source is published at github.com/arpitpandey0307/SOV-OPT. The open-source license is <em>to be decided</em>.
        </p>
      </section>
    </LegalPage>
  );
}
