# Práctica IG S9 — Shader de Fragmentos Generativo (*Tiny Code*)

**Título del shader:** *Mandala Caleidoscópico de Interferencia*  
**Shader *tiny code*:** [shader.frag](./shader.frag) (**493 bytes** ≤ 512 bytes, incluidos `uniforms` y `precision mediump float;`, sin comentarios)  
**Shader legible (comentado):** [shader_legible.frag](./shader_legible.frag) (equivalente matemático exacto)  
**Compatibilidad:** GLSL ES 1.00 / WebGL 1 — ejecutable directamente en [The Book of Shaders Editor](http://editor.thebookofshaders.com) y en el visor local en JavaScript vanilla + Three.js (sin `npm` ni `Vite`).

---

## 1. Motivación

La motivación principal de este *shader* nace de intentar capturar la sensación hipnótica que se experimenta al mirar a través de un **caleidoscopio**: esa mezcla de simetría infinita, reflejos que se multiplican al girar el tubo y fragmentos de luz que cambian constantemente de forma y color. Al mismo tiempo, las formas estrelladas y los destellos luminosos que brotan y se expanden en cada octava buscan evocar el estallido vibrante de unos **fuegos artificiales** en el cielo nocturno, combinando geometría caleidoscópica con un dinamismo festivo y brillante.

Para materializar esta idea en un archivo compacto de menos de 512 bytes, adecuado tanto para su ejecución en *The Book of Shaders* como para formar parte de un *reel* audiovisual, la composición combina cuatro técnicas del guion de la práctica S9:
1. **Patrones generativos con `fract`**: subdivisión iterativa del espacio aprovechando el paralelismo de la GPU.
2. **Rotación 2D con matrices (`mat2`)** dependiente del tiempo (`u_time`) y de cada escala.
3. **Coordenadas polares (`atan`, `length`)** del *Laboratorio de formas* para esculpir rosetones de 6 pétalos.
4. **Ondas de interferencia radiales** del *Efecto túnel* combinadas con una **paleta cosenoidal procedural** (Inigo Quilez) para obtener colores iridiscentes suaves sin texturas.

Al normalizar por `min(u_resolution.x, u_resolution.y)` y depender únicamente de `u_resolution` y `u_time`, el resultado conserva sus proporciones en cualquier formato (`1:1`, `16:9` o `9:16`) y funciona de forma autónoma.

---

## 2. Código del shader ([shader.frag](./shader.frag) — 493 bytes)

```glsl
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
void main(){
vec2 r=u_resolution,u=(gl_FragCoord.xy*2.-r)/min(r.x,r.y);
float d0=length(u),t=u_time,a,c,s,d;vec3 o=vec3(0.);
for(float i=0.;i<4.;i++){
a=t*.15+i*.5;c=cos(a);s=sin(a);
u=fract(mat2(c,-s,s,c)*u*1.5)-.5;
d=(length(u)+.07*cos(6.*atan(u.y,u.x+1e-5)+t*2.-i))*exp(-d0);
d=pow(.096/(abs(sin(d*8.-t*1.6+i))+.016),1.15);
o+=(.5+.5*cos(6.283*(d0+i*.35-t*.25+vec3(0.,.2,.4))))*d;
}
gl_FragColor=vec4(o/(1.+o),1.);
}
```

---

## 3. Desarrollo paso a paso

1. **Centrado y normalización independiente del aspecto**:
   `u = (gl_FragCoord.xy * 2. - r) / min(r.x, r.y)` lleva el origen al centro de la pantalla sin deformaciones en `1:1`, `16:9` o `9:16`. Se guarda `d0 = length(u)` como distancia radial global antes de subdividir el espacio.
2. **Bucle fractal de 4 octavas (`i = 0..3`)**:
   En cada iteración se rota el plano un ángulo `a = t * 0.15 + i * 0.5` mediante `mat2(c, -s, s, c)` y se aplica un teselado recursivo centrado con `fract(... * 1.5) - 0.5`. El factor no entero `1.5` evita una rejilla trivial y crea interferencias autosimilares.
3. **Modulación polar en rosetón y envolvente global**:
   `length(u) + 0.07 * cos(6. * atan(u.y, u.x + 1e-5) + t * 2. - i)` añade simetría rotacional de 6 pétalos animados en cada celda (el `+ 1e-5` evita `atan(0, 0)` indefinido en GLSL ES 1.00). Multiplicar por `exp(-d0)` atenúa el campo hacia el exterior y concentra el foco visual.
4. **Ondas de interferencia y brillo neón**:
   `pow(0.096 / (abs(sin(d * 8. - t * 1.6 + i)) + 0.016), 1.15)` convierte los ceros de la onda sinusoidal móvil en curvas luminosas de alto contraste, con `+ 0.016` para evitar divisiones por cero.
5. **Paleta cosenoidal procedural (Inigo Quilez)**:
   `0.5 + 0.5 * cos(6.283 * (d0 + i * 0.35 - t * 0.25 + vec3(0., 0.2, 0.4)))` colorea cada octava con un gradiente continuo en tonos dorados, cianes, azules y magentas.
6. **Mapeo tonal de Reinhard**:
   `o / (1. + o)` comprime el rango dinámico al sumar las 4 capas aditivas para mantener la nitidez cromática sin quemar a blanco plano.

---

## 4. Estructura y ejecución

```text
S9/
├── index.html          # Visor a pantalla completa (Three.js vía importmap CDN, sin npm ni Vite)
├── main.js             # Script en JavaScript vanilla
├── shader.frag         # Shader tiny code (493 bytes ≤ 512 bytes)
├── shader_legible.frag # Versión legible y comentada equivalente
└── README.md           # Esta documentación
```

### Ejecución local (sin `npm` ni `Vite`)
Servir la carpeta raíz con cualquier servidor estático (por ejemplo *Live Server* de VS Code o Python):

```bash
python -m http.server 8090
```

Abrir `http://localhost:8090/` en el navegador.

### Ejecución en *The Book of Shaders Editor*
Copiar y pegar directamente el contenido de [shader.frag](./shader.frag) en [http://editor.thebookofshaders.com](http://editor.thebookofshaders.com).

---

## 5. Referencias

- **[Gon21]** Patricio Gonzalez Vivo y Jen Lowe. *The Book of Shaders*. https://thebookofshaders.com/
- **[Qui15]** Inigo Quilez. *Palettes — Procedural Cosine Color Palettes*. https://iquilezles.org/articles/palettes/
- **[Kis23]** Kishimisu. *An introduction to Shader Art Coding*. https://www.youtube.com/watch?v=f4s1h2YETNY
- **[IG-S9]** Guion y ejemplos de la sesión S9 (*Shaders*), Informática Gráfica (ULPGC).
- **[Khronos]** *OpenGL ES Shading Language (GLSL ES 1.00) Reference*. https://www.khronos.org/opengles/sdk/docs/manglsl/docbook4/
- **[Three.js]** Three.js Documentation — `ShaderMaterial`. https://threejs.org/docs/#api/en/materials/ShaderMaterial
