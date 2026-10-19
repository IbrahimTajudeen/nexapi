# NyxAPI tutorials

The video playlist plan lives on the website at `/tutorials/` and its source is
[`website/src/tutorials.ts`](../website/src/tutorials.ts): 30 episodes in six modules, from first
install to production. Each episode has goals, prerequisites, a timed outline, code samples and
tutor notes (hook, talking points, demo steps, pitfalls, an exercise and a closing line).

## Modules

1. Start here (episodes 1 to 5)
2. Core concepts (6 to 12)
3. No schema: manual endpoints and HTTP (13 to 16)
4. React and server rendering (17 to 20)
5. Schemas and code generation (21 to 24)
6. Professional NyxAPI (25 to 30)

## Recording an episode

1. Pick an episode and open an issue titled `Tutorial: episode N` so nobody duplicates it.
2. Read the episode page and the docs it links to. Run every sample yourself.
3. Record, edit and publish on a platform you control.
4. Comment the link on your issue. A maintainer reviews it.

Standards: state the NyxAPI version, 1080p with a font of at least 18 pt, clear audio, accurate
captions or a transcript, chapters that match the outline, no secrets on screen, and no claims you
have not verified. Say plainly when something is on the roadmap rather than shipped.

Ownership: tutors keep ownership of their videos and allow the project to link to and embed them.
This wording is a proposal; maintainers should confirm it before relying on it.

## Maintainers

When an episode is claimed or published, edit it in `website/src/tutorials.ts`:

```ts
status: "published",
tutorName: "Name",
videoUrl: "https://...",
```

`website/test/tutorials.test.ts` checks numbering, outline timing, example ids and doc links, and
that a video URL is present only for published episodes. Runnable samples are the same ones the
site tests execute.
