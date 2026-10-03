Follow-up tests

11-two-layer-screen-blend.xml
  If this PASSES while 09-screen-blend.xml FAILS, blendMode itself is valid;
  Alight Motion likely rejects applying a blend mode to the only/bottom layer.

12-full-with-internal-comments.xml
  Same full multilayer structure, but with XML comments before the layer nodes.
  Compare against 10-full-multi-layer.xml, which passed.

13-full-comments-between-layers-only.xml
  Removes the comment before layer 1 but retains comments between layers 1/2 and 2/3.
  Helps isolate whether comments interspersed among scene children confuse the importer.
