# Source art

**Drop original images here.** Full resolution, whatever the camera or the
generator gave you — this is the input side. `tools/prep-scene.py` reads from
here and writes the tone-mapped 760x912 result into
`public/assets/scenes/`.

Name a file after the door it is a candidate for, plus anything that tells the
options apart:

    projects-anvil-a.png
    projects-anvil-b.png
    projects-forge-wide.jpg

These are committed rather than ignored. The scenes in `public/assets/scenes/`
are derived, and `CLAUDE.md` marks the real ones as art that a `tools/` script
must never regenerate — so if the originals are not kept, a scene can be
adjusted exactly once and then never again. They are small enough to be worth
it; anything over about 6 MB gets downscaled before committing.

## Turning one into a door scene

A door shows only the middle of its picture: about 82% of the height at rest,
and **56% of the height by 50% of the width** once the hover zoom is running.
So the subject has to sit in the middle with room around it. Two modes:

```bash
# crop INTO a picture that fills its own frame
python tools/prep-scene.py art-source/foo.jpg public/assets/scenes/projects.jpg \
    --scale 0.76 --focus 0.47,0.47

# pad AROUND a bright subject on a dark ground
python tools/prep-scene.py art-source/foo.png public/assets/scenes/projects.jpg \
    --fit-subject 0.80 --scale 1.0
```

Picking the wrong mode is the documented mistake — see the note in
`CLAUDE.md` under "Known placeholders".
