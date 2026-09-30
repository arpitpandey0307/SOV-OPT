Act as a senior web designer and frontend engineer. Build a clean, polished website with the restraint and product focus I associate with Apple's marketing pages. Give my brand its own identity.

Product: [WHAT IT DOES]
Audience: [WHO IT'S FOR]
Main action: [WHAT VISITORS SHOULD DO]
Real content and assets: [COPY, SCREENSHOTS, PHOTOS, DEMO]
Pages and functionality: [WHAT THIS VERSION NEEDS]
Existing stack: [IF ANY]
Reference: [URL OR SCREENSHOT, PLUS WHAT YOU LIKE]

Inspect an existing project before changing it. Preserve working features. Use the simplest implementation that supports the brief.

DESIGN DIRECTION
Use a near-white or warm neutral background, dark readable text, and one restrained accent. Create hierarchy through typography, spacing, and alignment. Establish reusable values for these choices.

Make the actual product the main visual. Use concise headlines, readable paragraphs, and generous space around important content. Vary section composition according to what it explains.

Avoid harsh gradients, rainbow colors, neon colors, generic pastels, and purple-and-black themes. Don't use pure white as the page background.

No radial orbs, dot grids, liquid glass, decorative colored stripes, sparkle icons, emojis, or animated arrows. Don't put shadows on everything or use soft rounded corners throughout.

Don't use Inter, Geist, Space Grotesk, or Lucide icons. Choose a readable alternative or a suitable system font stack. Use icons only when they clarify an action.

CONTENT AND STRUCTURE
Don't default to three feature cards, bento grids, decorative terminal windows, checkmark bullets, or three pricing tiers. Show actual pricing only if supplied.

Don't invent testimonials, logos, statistics, customers, or claims. Use real screenshots or a working demonstration. Label simulated results clearly.

Write specific copy. Avoid em dashes, en dashes, and the formula that rejects one description before declaring another. State the benefit directly.

BEHAVIOR
Keep motion restrained and purposeful. Don't animate every hover. Respect reduced-motion preferences and preserve normal scrolling.

Make buttons, menus, and forms work. Include keyboard focus, labeled inputs, and useful error and empty states. Use skeleton loaders where real asynchronous content needs them, without artificial delays.

Include Terms of Service and Privacy Policy links and pages based on the actual business and data practices. Mark missing details as drafts for review. Don't invent legal commitments.

WORKFLOW
Explain your visual direction briefly. Build one representative section with real content, inspect it at desktop and mobile widths, then extend the design.

Use the selected resources below only where they solve a concrete need. Follow current documentation. Don't install every library.

Check mobile wrapping, overflow, contrast, links, and the complete main action. Fix problems you observe. Report what you actually tested and what remains unfinished. Don't claim to have inspected a page you couldn't run.

refrences to use while designing the frontend and ui of the application:



These resources provide visual references, design instructions, or implementation tools. The linked guidance is free to read; use the free library features described below.

1. Apple’s product pages: give the AI a real reference

Start with Apple’s MacBook Pro page. My suggestion is to study how the product, headline, and supporting details share the space. Give the AI a screenshot of the particular section you like.

Tell it: “Analyze the hierarchy, image scale, and spacing in this reference. Apply those principles to my content.”

Use your own imagery and branding. Treat the page as a visual reference, not a source of reusable assets or an exact layout to duplicate.

2. Anthropic’s frontend-design skill: give it better design instructions

Anthropic publishes a frontend-design skill in its official repository. It guides decisions about visual identity, typography, and avoiding templated defaults.

Tell your assistant: “Read this skill and apply it to my brief. Keep the direction restrained, editorial, and focused on the product.”

That last sentence matters. Distinctive design can be bold or experimental. You’re specifying the direction you want. If your assistant can’t open the link, supply the skill text as context.

3. Radix Primitives: build controls without inheriting a template

Radix Primitives, maintained by WorkOS, supplies unstyled components with behavior such as focus management and keyboard interaction. Official GitHub repo.

For a React project, tell the AI: “Use Radix where we need a dialog, tabs, or a dropdown. Style those controls with our typography, spacing, and neutral palette.”

The primitives supply behavior. Your design choices supply the appearance. Keep existing components if they already do the job.

4. Motion: add subtle movement to the interface

Motion’s free core library supports transitions, springs, and scroll-linked effects. Give your assistant the React documentation when that’s your stack.

My suggested brief: “Use short opacity transitions and small movements for meaningful state changes. Keep the page calm and support reduced motion.”

Start with one interaction. A product image changing cleanly when someone selects a variant can be more useful than every paragraph flying onto the screen. Paid Motion+ extras aren’t required for this approach.

5. GSAP ScrollTrigger: build a deliberate product reveal

For a more ambitious product story, GSAP ScrollTrigger can connect animation progress to scrolling and pin a section. Official repo. GSAP is free under its standard license, supported by Webflow.

Tell the AI: “Create one product demonstration that progresses with scrolling. Keep it short, preserve scroll control, and provide a simple mobile and reduced-motion version.”

This is optional. Choose it when the sequence explains the product. You don’t need both GSAP and Motion for a simple landing page.

Share


6. Vercel’s web-design-guidelines skill: tighten the finish

Vercel’s official agent-skills repository includes web-design-guidelines covering interface details such as focus states, forms, typography, images, and motion.

After building, ask: “Apply the web-design-guidelines skill to this implementation. Fix relevant issues while preserving the approved visual direction.”

Use this for the final polish. It won’t choose an Apple-inspired aesthetic for you, but it helps the agent check details that a vague “make it premium” request misses.

The combination you should be start with

An Apple reference screenshot, Anthropic’s design skill, and the main prompt above. Add Radix if the React interface needs complex controls. Add one motion library only when there’s a specific interaction to build.

Then check the result on your phone. Read the headline, open the menu, and complete the main action. Ask for targeted changes: “Give the product image more space” is far more useful than “make it better.”

One clear story. A working product. 