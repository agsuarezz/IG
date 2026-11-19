// ============================================================================
// Mandala Caleidoscopico de Interferencia — Version legible y comentada
// Practica IG S9 (Shaders) — Compatible con The Book of Shaders (GLSL ES 1.00)
// Equivalente matematico exacto a shader.frag (493 bytes)
// ============================================================================

precision mediump float;

uniform vec2 u_resolution; // Resolucion del lienzo en pixeles
uniform float u_time;      // Tiempo transcurrido en segundos

// Matriz de rotacion 2D
mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

// Paleta cosenoidal procedural (Inigo Quilez)
vec3 cosinePalette(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.2, 0.4);
    return a + b * cos(6.283 * (c * t + d));
}

void main() {
    // 1. Coordenadas centradas en (0, 0) e independientes de la relacion de aspecto
    //    Dividir por min(res.x, res.y) evita deformaciones en 1:1, 16:9 y 9:16
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);

    // 2. Distancia radial global al centro antes del teselado fractal
    float radialDist = length(uv);
    float t = u_time;

    // Acumulador de color HDR
    vec3 finalColor = vec3(0.0);

    // 3. Superposicion iterativa de 4 octavas fractales
    for (float i = 0.0; i < 4.0; i++) {
        // 3a. Rotacion diferencial dependiente del tiempo y la octava actual
        float angle = t * 0.15 + i * 0.5;

        // 3b. Rotacion + teselado recursivo del espacio (patron generativo con fract)
        uv = fract(rotate2d(angle) * uv * 1.5) - 0.5;

        // 3c. Campo de distancia celular modulado en coordenadas polares (roseton de 6 petalos)
        //     y atenuado por una envolvente exponencial desde el centro global
        float polarAngle = atan(uv.y, uv.x + 1e-5);
        float petalModulation = 0.07 * cos(6.0 * polarAngle + t * 2.0 - i);
        float dist = (length(uv) + petalModulation) * exp(-radialDist);

        // 3d. Ondas de interferencia dinamicas y realce luminoso tipo neon
        float wave = abs(sin(dist * 8.0 - t * 1.6 + i));
        float glow = pow(0.096 / (wave + 0.016), 1.15);

        // 3e. Coloracion con paleta cosenoidal sincronizada con radio, octava y tiempo
        vec3 col = cosinePalette(radialDist + i * 0.35 - t * 0.25);

        // Acumulacion aditiva de la octava
        finalColor += col * glow;
    }

    // 4. Mapeo tonal de Reinhard para evitar saturacion brusca al blanco
    finalColor = finalColor / (1.0 + finalColor);

    gl_FragColor = vec4(finalColor, 1.0);
}
