import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <LegalPage title="Privacy Policy" updated="30 September 2026">
      <section>
        <h2>Who runs this software</h2>
        <p>
          SOV-OPT is built by a student team for Smart India Hackathon 2026, problem statement 26119. Each installation is
          operated by whoever deploys it. The operator of this installation is <em>to be decided</em>.
        </p>
      </section>
      <section>
        <h2>What the application stores</h2>
        <ul>
          <li>Model files you upload, saved on the server that runs the control plane.</li>
          <li>Run records: the configuration you chose, results, timings and the full event trace of each solve.</li>
          <li>Profiles computed from each model, such as sizes, coefficient ranges and the sparsity summary.</li>
          <li>Hardware details of the server (processor, memory, GPU model and driver), which are written into run passports.</li>
        </ul>
        <p>The application has no user accounts and does not ask for names, email addresses or other personal details.</p>
      </section>
      <section>
        <h2>What it does not do</h2>
        <ul>
          <li>It sets no cookies and runs no analytics or advertising scripts.</li>
          <li>Fonts are served from this installation, so pages make no requests to font providers.</li>
          <li>Model files and results are not sent to any third party by the application.</li>
        </ul>
      </section>
      <section>
        <h2>Evidence bundles</h2>
        <p>
          A downloaded evidence bundle contains the run passport, configuration, event trace, verification report and model
          profile. Anyone you share a bundle with can read those contents, including the server hardware details.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Uploaded models and run records stay on the server until the operator removes them. A retention period and a
          deletion request process are <em>to be decided</em>.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          A privacy contact is <em>to be decided</em>. Until then, raise questions through the project repository at
          github.com/arpitpandey0307/SOV-OPT.
        </p>
      </section>
    </LegalPage>
  );
}
