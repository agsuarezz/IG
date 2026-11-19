# Extra S9 — Integración de Shaders en el Sistema Planetario (S7)

Esta carpeta contiene una copia independiente de la práctica **S7 (Sistema Planetario 3D)** en **JavaScript vanilla + Three.js** (vía `<script type="importmap">`, sin `npm` ni `Vite`) a la que se le han integrado **tres shaders GLSL** desarrollados a partir de los contenidos de la práctica S9.

## Shaders integrados ([src/script.js](./src/script.js))

1. **Sol animado (plasma + corona Fresnel)**
   - **Vertex shader (`sunVertexShader`)**: deforma suavemente los vértices de la esfera del Sol a lo largo de su normal usando ruido trigonométrico 3D dependiente de `u_time` para simular turbulencias y protuberancias solares.
   - **Fragment shader (`sunFragmentShader`)**: desplaza y mezcla dos muestras de `sun.jpg` en direcciones opuestas para dar sensación de plasma hirviendo, realza las zonas elevadas y añade brillo en los bordes con un término Fresnel.
   - **Corona solar (`coronaVertexShader` / `coronaFragmentShader`)**: esfera concéntrica exterior con `THREE.BackSide` y `THREE.AdditiveBlending` que genera un halo dorado animado con rayos coronales sutiles.

2. **Tierra Día/Noche + halo atmosférico**
   - **Doble textura (`earthVertexShader` / `earthFragmentShader`)**: calcula el producto escalar `dot(N, L)` entre la normal del fragmento y la dirección al Sol en `(0, 0, 0)` (misma idea que `script_36_shader_dobletextura.js` del guion S9). En la cara iluminada muestra `earth.jpg` con reflejo especular oceánico (`earthspec1k.jpg`), en la transición dibuja una banda anaranjada de atardecer, y en la cara en sombra enciende las luces nocturnas (`earth_lights_2k.png`).
   - **Halo atmosférico (`earthHaloVertexShader` / `earthHaloFragmentShader`)**: capa aditiva exterior con Fresnel azulado más intenso en el lado iluminado por el Sol.

3. **Portal Caleidoscópico S9 (agujero de gusano)**
   - **Vertex shader (`portalVertexShader`)**: añade una ondulación sinusoidal en profundidad sobre el disco del portal.
   - **Fragment shader (`portalFragmentShader`)**: reutiliza directamente el patrón generativo de [../shader.frag](../shader.frag) (caleidoscopio fractal de 4 octavas con `fract`, `mat2`, simetría polar `atan` y paleta cosenoidal), recortado en un círculo suave con un aro luminoso cian en el borde y un anillo 3D exterior.

## Controles añadidos en `lil-gui` (carpeta `Shaders S9`)

- **Plasma solar**: ajusta la intensidad del desplazamiento de vértices en el Sol.
- **Luces Tierra**: regula el brillo de las ciudades en la cara nocturna de la Tierra.
- **Portal S9** y **Vel. portal**: muestra/oculta el portal caleidoscópico y controla su velocidad de animación.
- **Enfocar Sol / Enfocar Tierra (Día/Noche) / Enfocar Portal S9**: coloca la cámara directamente frente a cada shader (al enfocar la Tierra, la cámara acompaña su órbita para poder inspeccionar cómodamente el terminador y las luces nocturnas).

## Ejecución local

Servir esta carpeta con cualquier servidor HTTP estático (por ejemplo *Live Server* de VS Code o Python):

```bash
python -m http.server 8091
```

Abrir `http://localhost:8091/` en el navegador.
