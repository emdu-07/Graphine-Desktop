Blend-mode follow-up

14-two-layer-blending-attribute.xml
  Uses the form seen in actual exported Alight Motion XML:
      blending="screen"
  on the layer itself.

15-full-multilayer-no-blend.xml
  Full repository multi-layer composition with blend mode removed.
  If this imports, the rest of the combined project is acceptable.

16-full-multilayer-blending-attribute.xml
  Same full project, but replaces:
      <blendMode value="screen" />
  with:
      blending="screen"
  on the circle shape.

Most useful result:
  14 PASS
  15 PASS
  16 PASS
would strongly establish that the repository's blendMode child representation
is inaccurate for real Alight Motion project imports.
