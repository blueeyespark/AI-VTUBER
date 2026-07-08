# Custom VTuber Models

Add custom 3D or 2D VTuber models here. Each model gets its own folder with a
`model.json` manifest.

## 3D VRM example

```text
assets/vtuber_models/my_3d_model/
  model.json
  character.vrm
```

```json
{
  "name": "My 3D Model",
  "type": "3d",
  "format": "vrm",
  "path": "character.vrm",
  "outfits": ["Default"],
  "description": "A custom VRM model with Blue's desktop movement."
}
```

For 3D outfit changes, export each outfit as its own `.vrm` and add it as
another model folder. Blue can switch between those model entries. If a future
VRM contains named outfit meshes that can be hidden/shown, add those names to
the manifest and wire them to the Outfit action.

## 2D image example

```text
assets/vtuber_models/my_2d_model/
  model.json
  character.png
```

```json
{
  "name": "My 2D Model",
  "type": "2d",
  "format": "image",
  "path": "character.png",
  "description": "A transparent PNG, WEBP, or GIF used as a 2D desktop model."
}
```

## VTube Studio / Live2D example

Copy the full model folder from VTube Studio into this directory, then add a
manifest that points at the `.model3.json` file.

```text
assets/vtuber_models/my_live2d_model/
  model.json
  character.model3.json
  character.moc3
  character.physics3.json
  character.8192/
    texture_00.png
```

```json
{
  "name": "My Live2D Model",
  "type": "2d",
  "format": "live2d",
  "path": "character.model3.json",
  "outfits": ["Outfit 2"],
  "description": "A VTube Studio / Live2D Cubism model."
}
```

For Live2D outfit changes, list the outfit expressions in the model's
`.model3.json` `FileReferences.Expressions` array. Blue only calls expressions
that the model file actually exposes, and can occasionally pick an outfit
expression while idle if proactivity is enabled.

Restart or choose Refresh Models in the Motion tab after adding files.
