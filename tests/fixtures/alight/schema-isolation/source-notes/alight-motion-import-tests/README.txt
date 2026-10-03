# Alight Motion XML Import Isolation Tests

Import the files in numeric order.

Record PASS if Alight Motion imports the project, and FAIL if it reports an
incorrect/corrupted format.

The purpose is to isolate which construct from the repository's
multi-layer.xml example causes the real Alight Motion importer to reject it.

Recommended result log:

01-minimal-control.xml      PASS / FAIL
02-two-solid-layers.xml     PASS / FAIL
03-size-property.xml        PASS / FAIL
04-static-gradient.xml      PASS / FAIL
05-animated-location.xml    PASS / FAIL
06-circle-shape.xml         PASS / FAIL
07-animated-scale.xml       PASS / FAIL
08-animated-opacity.xml     PASS / FAIL
09-screen-blend.xml         PASS / FAIL
10-full-multi-layer.xml     PASS / FAIL

Important:
- Files 02–09 are isolation tests, not cumulative tests.
- Each keeps the known-good scene metadata and changes as little as possible.
- File 10 reproduces the full repository multi-layer structure.
- All XML files were checked locally for XML well-formedness. This does NOT
  imply that Alight Motion accepts their schema.
