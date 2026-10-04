# Documento de Especificación de Requerimientos de Software (SRS / PRD)

**Proyecto:** SólidoViz — Visualizador Geométrico de Regiones para Integrales Múltiples y Cambios de Variable

**Destinatarios del Desarrollo:** Equipos autónomos de ingeniería (Claude 3.7 / Claude Code, Devin AI, SWE-Bench stack)

**Dominio Matemático:** Análisis Matemático II (Cálculo Multivariable Universitario - Cátedra UTN)

**Versión:** 1.0.0 — Exhaustive Technical Draft

---

## 1. Visión General y Filosofía del Producto

### 1.1 Declaración del Problema

En la enseñanza universitaria de Análisis Matemático II, el mayor obstáculo pedagógico para los estudiantes radica en la visualización espacial tridimensional ($\mathbb{R}^3$) y bidimensional ($\mathbb{R}^2$):

1. **Dificultad de clausura:** Identificar visualmente la región acotada $R$ encerrada simultáneamente por múltiples superficies (ej. paraboloides, planos oblicuos, cilindros y conos en octantes específicos).
2. **Determinación del orden de integración:** Deducir los límites de una integral iterada exige comprender por dónde "entra" y "sale" un rayo o recta directriz imaginaria a través del sólido o región.
3. **Falta de correspondencia proyectiva:** Comprender la relación entre un sólido $S_{1,2}$ en $\mathbb{R}^3$ y su sombra proyectada $R'$ en el plano coordenado correspondiente ($xy$, $xz$, $yz$) es difícil sin una representación sincrónica lado a lado.
4. **Insuficiencia del software existente:** Herramientas como GeoGebra o WolframAlpha son motores algebraicos o graficadores genéricos que requieren parametrizaciones complejas, lógicas booleanas manuales para recortar mallas y no ofrecen herramientas pedagógicas nativas orientadas al planteo iterado (flechas de barrido, vectores de perforación, proyección simultánea 2D/3D).

### 1.2 Declaración de Alcance y Principio Fundamental ("No-Solver Policy")

* **EL SISTEMA NO DEBE RESOLVER LA INTEGRAL:** No calcula antiderivadas simbólicas, ni sumas numéricas de Gauss-Legendre, ni resultados escalares definitivos del integrando $f(x,y,z)$.
* **EL SISTEMA DEBE SER UN ASISTENTE GEOMÉTRICO VISUAL:** Su único propósito es permitir al usuario cargar las ecuaciones/desigualdades de las fronteras de la región, procesar la geometría acotada resultante, renderizar el sólido y sus proyecciones, y asistir al estudiante para que **él mismo** determine y verifique los límites de integración iterados.

---

## 2. Arquitectura de Alto Nivel y Stack Tecnológico

### 2.1 Stack Tecnológico Recomendado

* **Entorno & Framework Base:** Next.js (App Router) o React 19 + TypeScript + Vite.
* **Estilizado & Componentes UI:** Tailwind CSS v4 + Shadcn/UI + Lucide Icons.
* **Motor Gráfico 3D:** Three.js a través de `@react-three/fiber` y `@react-three/drei`.
* **Motor Gráfico 2D:** Canvas API nativo / HTML5 SVG interactivo vía D3.js o PixiJS.
* **Parser Matemático y Geometría Computacional:**
* `mathjs` para parsing y evaluación simbólica de curvas/superficies.
* Algoritmos de mallado: Voxel Grid / Marching Cubes (ej. `three-marching-cubes` o evaluación implícita con shaders WebGL/Three.js) y operaciones booleanas mediante `three-bvh-csg` (Constructive Solid Geometry) para el recorte exacto de superficies cerradas.


* **Renderizado Tipográfico de Eórmulas:** KaTeX para la visualización de ecuaciones matemáticas.

### 2.2 Diagrama Arquitectónico Conceptual

```text
+-----------------------------------------------------------------------------------+
|                                 SÓLIDOVIZ UI                                      |
+-----------------------------------------------------------------------------------+
|  SIDEBAR DE ENTRADA              |  CANVAS DUAL INTERACTIVO                       |
|  - Selección de Módulo (1 a 4)   |  +---------------------+---------------------+ |
|  - Gestor de Ecuaciones/Fronteras|  | VISTA PRINCIPAL     | VISTA DE PROYECCIÓN | |
|  - Restricciones de Dominio      |  | 3D (Three.js Canvas)| 2D (Sombra R')      | |
|  - Selector de Orden de Barrido  |  | Transparencias,     | Curvas frontera,    | |
|  - Inspector de Límites          |  | Vectores de Entrada | Flechas de barrido  | |
|                                  |  | y Salida (Raycasting| direccional         | |
|                                  |  +---------------------+---------------------+ |
+----------------------------------+------------------------------------------------+
|  MOTOR MATEMÁTICO & CSG (Web Workers)                                             |
|  - Parsing de Funciones -> Implicit Function Sampler                              |
|  - Recorte Booleano (CSG Intersections) -> Malla Poligonal Delimitada             |
|  - Proyector Ortogonal (Sombra 3D -> Bounding 2D Path)                            |
+-----------------------------------------------------------------------------------+

```

---

## 3. Módulos Funcionales (Las 4 Secciones Académicas)

El software debe dividirse en cuatro secciones independientes, accesibles desde una barra de navegación superior o selector contextual.

```text
                                  +-----------------------+
                                  |   SólidoViz Engine    |
                                  +-----------+-----------+
                                              |
        +---------------------+---------------+---------------+---------------------+
        |                     |                               |                     |
        v                     v                               v                     v
+---------------+     +---------------+               +---------------+     +---------------+
|   MÓDULO 1    |     |   MÓDULO 2    |               |   MÓDULO 3    |     |   MÓDULO 4    |
| Dobles        |     | Dobles        |               | Triples       |     | Triples       |
| Cartesianas   |     | Cambio Var.   |               | Cartesianas   |     | Cambio Var.   |
| (T1 / T2)     |     | (Polar/Elip)  |               | (S12/S23/S13) |     | (Cil/Esfer)   |
+---------------+     +---------------+               +---------------+     +---------------+

```

---

### Módulo 1: Integrales Dobles en Coordenadas Cartesianas ($\mathbb{R}^2$)

Orientado a la resolución práctica de la Guía 13 y Guía 15 (clasificación de regiones planas).

#### 1.1 Entradas de Usuario (Input)

* Lista dinámica de ecuaciones de curvas límite: $y = f(x)$, $x = g(y)$, o implícitas $F(x,y) = c$.
* Intervalos de acotación explícitos opcionales: $x \in [a, b]$, $y \in [c, d]$.
* Restricciones de signos o cuadrantes (ej. $x \ge 0, y \ge 0$).
* Selector de estrategia de barrido:
* **Modo Tipo $T_1$ (Vertical):** Orden $dy\,dx$.
* **Modo Tipo $T_2$ (Horizontal):** Orden $dx\,dy$.



#### 1.2 Renderizado y Lógica Visual (Output)

1. **Detección y Sombreado de la Región $R$:**
* Localización automática de puntos de intersección entre curvas.
* Relleno cromático semitransparente (ej. azul celesta `#38BDF8` con opacidad al 35%) de la región cerrada y acotada formada por las intersecciones.


2. **Vector de Barrido Dinámico (La "Flecha de Integración"):**
* **En Tipo $T_1$:** Al desplazar un slider de $x$ (con $x \in [a, b]$), se dibuja una flecha vertical orientada hacia arriba que parte de la curva inferior $y = g_1(x)$ ("Punto de Entrada", verde) y llega a la curva superior $y = g_2(x)$ ("Punto de Salida", rojo).
* **En Tipo $T_2$:** Al desplazar un slider de $y$ (con $y \in [c, d]$), se dibuja una flecha horizontal orientada hacia la derecha que va de la curva izquierda $x = h_1(y)$ ("Entrada") a la curva derecha $x = h_2(y)$ ("Salida").


3. **Detector de Descomposición de Región ($R = R_1 \cup R_2$):**
* Si la curva inferior o superior cambia de fórmula a lo largo del intervalo, el sistema debe alertar visualmente: *"La región requiere partición en $N$ integrales bajo el orden seleccionado"*.
* Colorear cada subregión ($R_1, R_2$) con tonalidades diferenciadas e indicar los límites individuales para cada una.



---

### Módulo 2: Cambio de Variables en Integrales Dobles ($\mathbb{R}^2 \to \mathbb{R}^2$)

Orientado a la teoría y práctica de transformaciones curvilíneas, polares circulares y polares elípticas.

#### 2.1 Modos Soportados

1. **Polares Circulares:** $x = r \cos\theta,\; y = r \sin\theta,\quad J(r,\theta) = r$.
2. **Polares Elípticas:** $x = a\,r \cos\theta,\; y = b\,r \sin\theta,\quad J(r,\theta) = a \cdot b \cdot r$.
3. **Transformación General Lineal/Bilineal:** $u = U(x,y),\; v = V(x,y)$ o su inversa.

#### 2.2 Renderizado en Pantalla Dividida (Dual Canvas 2D)

* **Canvas Izquierdo (Plano $xy$):**
* Curvas originales (ej. elipse $x^2/9 + y^2/4 = 1$, hipérbolas $xy=1, xy=2$, o rectas $y=x, y=2x$).
* En modo polar: Dibujo de un sector angular sombreado, un rayo director que barre desde $\theta = \alpha$ hasta $\theta = \beta$, y un vector radial $r$ que nace en $r_1(\theta)$ y termina en $r_2(\theta)$.


* **Canvas Derecho (Plano Transformado $uv$ o $r\theta$):**
* Muestra la región $D$ correspondiente en coordenadas rectangulares transformadas.
* Si la región en $xy$ es una corona circular o elipse centrada, en el plano $r\theta$ se renderiza un rectángulo plano simple ($r \in [r_{\min}, r_{\max}], \theta \in [\theta_{\min}, \theta_{\max}]$).
* Interactividad sincronizada: Al mover un cursor en el plano $xy$, se actualiza el punto correspondiente en el plano $uv$ / $r\theta$ en tiempo real.



---

### Módulo 3: Integrales Triples en Coordenadas Cartesianas ($\mathbb{R}^3$)

Orientado a la visualización de sólidos cerrados, clasificación $S_{1,2}$, $S_{2,3}$, $S_{1,3}$ y reducción a integrales iteradas con sus sombras 2D.

#### 3.1 Entradas de Usuario (Input)

* Catálogo de superficies límite (ingresadas mediante inputs algebraicos):
* Planos: $Ax + By + Cz + D = 0$.
* Paraboloides: $z = \pm(x^2 + y^2)$, $y = x^2 + z^2$, etc.
* Esferas: $x^2 + y^2 + z^2 = R^2$.
* Cilindros: $x^2 + y^2 = R^2$, $y^2 + z^2 = R^2$, $x = y^2$, etc.
* Conos: $z^2 = x^2 + y^2$.


* Filtros de cuadrante/octante: Selectores tipo checkbox para $x \ge 0$, $y \ge 0$, $z \ge 0$ (Primer Octante).
* Selección de Orden de Integración:
* Tipo $S_{1,2}$ (Primero $z$): $dz\,dy\,dx$ o $dz\,dx\,dy$.
* Tipo $S_{2,3}$ (Primero $x$): $dx\,dy\,dz$ o $dx\,dz\,dy$.
* Tipo $S_{1,3}$ (Primero $y$): $dy\,dx\,dz$ o $dy\,dz\,dx$.



#### 3.2 Visualización 3D Principal (Three.js)

1. **Renderizado del Sólido Cerrado:**
* El volumen encerrado se renderiza como una geometría sólida unificada con opacidad controlable (default: 45%) y material reflectivo con bordes destacados (*edge outlines*).
* Las superficies componentes deben diferenciarse por colores pasteles transparentes (ej. Paraboloide = Naranja translúcido, Plano Techo = Azul translúcido).


2. **Flecha Tridimensional de Perforación (Piso $\to$ Techo):**
* Según el tipo de región seleccionada, el canvas muestra un vector 3D que atraviesa el sólido:
* Para $S_{1,2}$: Una flecha vertical paralela al eje $z$. Entra en la superficie piso $z = g_1(x,y)$ (marcador esférico verde) y sale por la superficie techo $z = g_2(x,y)$ (marcador esférico rojo).
* El usuario puede arrastrar interactivamente el punto base $(x,y)$ dentro de la región y ver cómo la flecha vertical cambia su longitud adaptándose al techo y piso del sólido.





#### 3.3 Visualización Secundaria Sincrónica: Sombra de Proyección 2D

* A la derecha del viewport 3D, una ventana 2D dedicada muestra la proyección ortogonal pura del sólido:
* Si se elige $S_{1,2}$, proyecta la región sombra $R'$ en el plano $xy$.
* Si se elige $S_{2,3}$, proyecta $R'$ en el plano $yz$.
* Si se elige $S_{1,3}$, proyecta $R'$ en el plano $xz$.


* La proyección 2D cuenta con la funcionalidad idéntica al Módulo 1 (flechas de barrido $T_1$ o $T_2$ sobre la sombra plana para deducir las dos integrales exteriores).

---

### Módulo 4: Cambio de Variables en Integrales Triples ($\mathbb{R}^3 \to \mathbb{R}^3$)

Orientado a integrales en coordenadas cilíndricas (circulares y elípticas) y esféricas.

#### 4.1 Cilíndricas Circulares y Elípticas

* **Fórmulas de Transformación:**
* Circulares: $x = r \cos\theta,\; y = r \sin\theta,\; z = z,\quad J = r$.
* Elípticas: $x = a\,r \cos\theta,\; y = b\,r \sin\theta,\; z = z,\quad J = a\,b\,r$.


* **Componentes Visuales:**
* Vista 3D: Muestra el sólido en $\mathbb{R}^3$.
* Elemento de volumen cilíndrico ("cuña"): Renderizado de un elemento diferencial $dV = r\,dr\,d\theta\,dz$ resaltado dentro del sólido.
* Plano base $xy$: Visualización polar con el barrido del ángulo $\theta \in [\alpha, \beta]$ y el segmento radial $r \in [r_1, r_2]$.
* Dirección $z$: Muestra las superficies límite expresadas como $z = k_1(r,\theta)$ y $z = k_2(r,\theta)$.



#### 4.2 Coordenadas Esféricas

* **Fórmulas de Transformación:**

$$\begin{cases} x = \rho \cos\theta \sin\phi \\ y = \rho \sin\theta \sin\phi \\ z = \rho \cos\phi \end{cases} \quad \text{con } \rho \ge 0,\; \theta \in [0, 2\pi],\; \phi \in [0, \pi],\quad J = -\rho^2 \sin\phi$$

* **Guías Visuales Especializadas para Esféricas:**
* **Cono de apertura $\phi$:** Renderizado de un arco angular medido desde el semieje positivo $z$ descendiendo hacia el plano $xy$ (indicando $\phi = 0$ en el eje $+z$ y $\phi = \pi/2$ en el plano horizontal).
* **Sector polar $\theta$:** Ángulo en el plano $xy$ medido en sentido antihorario desde el semieje $+x$.
* **Rayo Vectorial Radial $\rho$:** Segmento que nace en el origen $(0,0,0)$ y sale al espacio, perforando el sólido desde una superficie esférica interior $\rho_1(\theta,\phi)$ hasta una exterior $\rho_2(\theta,\phi)$.



---

## 4. Especificación Detallada de la Interfaz de Usuario (UI/UX)

```text
+------------------------------------------------------------------------------------------------------+
| [Logo] SólidoViz  | [1. Dobles 2D] | [2. Cambio Dobles] | [3. Triples 3D] | [4. Cambio Triples] | (?) |
+------------------------------------------------------------------------------------------------------+
| SIDEBAR DE CONTROL (360px)        | VIEWPORT PRINCIPAL 3D (Flex-1)   | PROYECCIÓN 2D / DUAL (380px)  |
|-----------------------------------|----------------------------------|-------------------------------|
| [+] Añadir Superficie/Frontera    |                                  | [Plano de Sombra: XY v]       |
| 1. [x] z = x^2 + y^2   [Color: O] |                                  |                               |
| 2. [x] z = 4           [Color: B] |         CANVAS 3D                |        CANVAS 2D              |
| 3. [x] x >= 0, y >= 0  (Oct. I)   |    (Orbital Controls)            |    (Proyección Ortogonal)     |
|-----------------------------------|                                  |                               |
| ORDEN DE INTEGRACIÓN:             |   [ Sólido translúcido ]         |   [ Región Sombra R' ]        |
| (•) S_1,2: dz dy dx               |   [ Flecha de Techo/Piso]        |   [ Flechas de barrido ]      |
| ( ) S_1,2: dz dx dy               |                                  |                               |
| ( ) S_2,3: dx dz dy               |                                  |                               |
|-----------------------------------|                                  |                               |
| SLIDERS DE EXPLORACIÓN:           |----------------------------------+-------------------------------|
| X corte: [----O-----] x = 1.2     | PANEL INFERIOR: RESUMEN DE LÍMITES ITERADOS                      |
| Y corte: [--------O-] y = 1.8     | \int_{0}^{2} dx \int_{0}^{\sqrt{4-x^2}} dy \int_{x^2+y^2}^{4} dz |
+------------------------------------------------------------------------------------------------------+

```

### 4.1 Componentes de la Interfaz

#### Componente A: Gestor de Fronteras (Sidebar Izquierdo)

* **Presets rápidos de examen:** Menú desplegable con los ejercicios típicos de los TP (ej. *"Cono y Cilindro $z^2 = x^2+y^2,\; x^2+y^2=1$"*, *"Paraboloide y Plano $z = x^2+y^2,\; z=4$"*, *"Tetraedro $x+y+z=1$"*).
* **Entrada Manual:** Campos con autocompletado y validación de sintaxis para cuádricas y planos.
* **Control de visibilidad y color:** Switch on/off para ocultar planos que puedan entorpecer la visión interna.

#### Componente B: Viewport 3D Principal

* **Controles de Cámara:** Orbit Controls de Three.js (Rotación libre con botón izquierdo, Pan con botón derecho, Zoom con rueda).
* **Botones de vista rápida:** Botón para saltar instantáneamente a vista ortogonal superior ($Top / xy$), frontal ($Front / xz$) o lateral ($Side / yz$).
* **Control de Opacidad Global:** Slider de transparencia para alternar entre ver las paredes del sólido o ver sólo el esqueleto de alambre (*wireframe*).

#### Componente C: Inspector de Límites Iterados (Dock Inferior)

* Genera dinámicamente el esqueleto en KaTeX del planteo de la integral según el orden seleccionado, por ejemplo:

$$\int_{a}^{b} dx \int_{g_1(x)}^{g_2(x)} dy \int_{k_1(x,y)}^{k_2(x,y)} dz$$

* Resalta con colores coincidentes entre la fórmula matemática y la flecha en la gráfica 3D/2D:
* Límite de $z$ en color Púrpura (coincide con la flecha 3D de techo y piso).
* Límite de $y$ en color Cian (coincide con el barrido vertical en la proyección 2D).
* Límite de $x$ en color Ámbar (coincide con el intervalo base en el eje horizontal).



---

## 5. Modelo de Datos y Contratos de Interfaces (TypeScript)

Para la implementación directa con Devin o Claude, la arquitectura de datos del frontend debe seguir los siguientes esquemas tipados:

```typescript
// ==========================================
// TIPOS BASE PARA DEFINICIÓN DE SUPERFICIES Y CURVAS
// ==========================================

export type GeometricDimension = '2D' | '3D';

export type CoordinateSystem = 
  | 'CARTESIAN_2D' 
  | 'POLAR_CIRCULAR' 
  | 'POLAR_ELLIPTIC' 
  | 'CARTESIAN_3D' 
  | 'CYLINDRICAL' 
  | 'SPHERICAL';

export type IntegrationOrder3D = 
  | 'dz_dy_dx' // S_1,2 (Tipo T1 en proyección)
  | 'dz_dx_dy' // S_1,2 (Tipo T2 en proyección)
  | 'dx_dy_dz' // S_2,3
  | 'dx_dz_dy' // S_2,3
  | 'dy_dx_dz' // S_1,3
  | 'dy_dz_dx'; // S_1,3

export interface BoundarySurface {
  id: string;
  name: string;
  rawExpression: string; // ej: "z = x^2 + y^2" o "x + y + z = 1"
  normalizedEquation: string; // F(x,y,z) = 0
  color: string;
  opacity: number;
  isVisible: boolean;
  type: 'PLANE' | 'PARABOLOID' | 'SPHERE' | 'CYLINDER' | 'CONE' | 'CUSTOM';
}

export interface RegionConstraint {
  axis: 'x' | 'y' | 'z' | 'r' | 'theta' | 'phi' | 'rho';
  operator: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}

// ==========================================
// ESTADO DE LA REGIÓN Y LÍMITES DETECTADOS
// ==========================================

export interface IntervalBound {
  minExpression: string;
  maxExpression: string;
  minValueNumeric?: number;
  maxValueNumeric?: number;
}

export interface IteratedLimitsAnalysis {
  order: IntegrationOrder3D | 'dy_dx' | 'dx_dy' | 'dr_dtheta' | 'drho_dtheta_dphi';
  outer: IntervalBound;      // Constantes puras: [a, b]
  middle: IntervalBound;     // Funciones de 1 variable: [g1(x), g2(x)]
  inner?: IntervalBound;     // Funciones de 2 variables: [k1(x,y), k2(x,y)] (solo en triples)
  isPartitionRequired: boolean;
  partitionRegionsCount: number;
  jacobianExpression?: string; // "1", "r", "abr", "rho^2 * sin(phi)"
}

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================

export interface AppState {
  activeModule: 1 | 2 | 3 | 4;
  coordinateSystem: CoordinateSystem;
  boundaries: BoundarySurface[];
  constraints: RegionConstraint[];
  integrationOrder: string;
  crossSectionSliders: {
    x: number;
    y: number;
    z: number;
    theta: number;
    phi: number;
  };
  detectedLimits: IteratedLimitsAnalysis | null;
}

```

---

## 6. Algoritmos Gráficos y Pipeline Matemático

Para evitar la sobrecarga de un backend pesado, el pipeline debe correr en el cliente optimizado mediante Web Workers y shaders:

```text
[Entrada de Ecuaciones String]
             │
             ▼
[Parser Simbólico: mathjs AST]
             │
             ▼
[Definición de Función Implícita F(x,y,z) ≤ 0]
             │
             ▼
[Construcción de Mallas Paramétricas / Vóxeles Tridimensionales]
             │
             ▼
[Operaciones Booleanas de Recorte CSG: three-bvh-csg]
             │
             ├──► Malla 3D del Sólido Acotado ──► [Viewport Three.js]
             │                                         │
             │                                         ▼
             │                                [Raycaster Techo/Piso]
             │                                (Flecha de Perforación 3D)
             ▼
[Proyector Ortogonal a Planos 2D (XY, YZ, XZ)]
             │
             ▼
[Generador de Contornos 2D / Convex Hull & Polígonos]
             │
             ▼
[Viewport 2D Sombra] ──► [Flechas de Barrido T1 / T2]

```

### 6.1 Detección del Techo y Piso con Three.js Raycaster

1. Se proyecta un rayo vertical desde el plano base hacia arriba: `origin = (x_slider, y_slider, -Infinity)`, `direction = (0, 0, 1)`.
2. El método `raycaster.intersectObjects(meshDelSolido)` devuelve los puntos de impacto en las mallas de frontera.
3. El primer punto de intersección con normal saliente o entrante define el **piso** ($z_1 = k_1(x,y)$) y el último punto define el **techo** ($z_2 = k_2(x,y)$).
4. Se dibuja una entidad `Line` tridimensional que une ambos puntos con conos en las puntas para indicar la flecha de perforación.

### 6.2 Proyección 2D Ortogonal Automática

1. La sombra de un sólido cerrado sobre el plano $xy$ se calcula extrayendo todos los vértices del sólido recortado por CSG y descartando su coordenada $z$ ($V_{xy} = (x, y)$).
2. Se ejecuta un algoritmo de envolvente cóncava / contorno 2D (ej. Alpha-Shape o extracción de bordes silueta calculados a partir de los triángulos cuyas normales sean perpendiculares al vector de vista del eje $z$).
3. Este contorno resultante se envía al Canvas 2D donde se dibujan las curvas límite en el plano.

---

## 7. Requerimientos No Funcionales

1. **Rendimiento:** El viewport 3D debe mantener un framerate sostenido de al menos **45 a 60 FPS** al orbitar o manipular los sliders de barrido, utilizando geometrías optimizadas (buffer geometries con recuento de polígonos balanceado).
2. **Interactividad Zero-Latency:** El movimiento de los sliders de exploración de corte transversal ($x, y, z$) debe refrescar los vectores de perforación en menos de **16ms** sin recalcular la malla CSG completa.
3. **Responsive / Desktop First:** Diseñado primordialmente para pantallas de escritorio o notebooks (resolución mínima recomendada: $1366 \times 768$), donde el estudiante trabaja con la guía de ejercicios al lado.
4. **Almacenamiento Local (Persistencia):** Soporte de exportación/importación en formato JSON del estado de los ejercicios para que el estudiante pueda guardar sus problemas de TP cargados en `localStorage`.

---

## 8. Guía de Implementación Paso a Paso (Prompt Maestro para Devin / Claude)

Para iniciar la codificación automatizada con Devin o Claude Code, utiliza el siguiente bloque maestro de instrucciones como prompt de arranque:

```markdown
### SYSTEM DIRECTIVE FOR AUTONOMOUS AGENT (DEVIN / CLAUDE CODE)

You are tasked with building "SólidoViz", a specialized Next.js/Three.js interactive web platform designed to help university students visualize 2D and 3D integration regions and determine iteration limits for multivariable calculus.

#### KEY CONSTRAINTS:
1. DO NOT build an integral solver. The system must NOT compute the scalar value or antiderivative of the integral.
2. The core value is GEOMETRIC VISUALIZATION: Show the bounded region enclosed by user-defined surfaces and illustrate the entry/exit sweep arrows.
3. Architecture: Next.js (App Router), Tailwind CSS, Lucide-react, Three.js via @react-three/fiber and @react-three/drei, mathjs, KaTeX, three-bvh-csg.

#### PHASE 1: CORE FOUNDATION & MODULE 1 (2D Double Integrals)
- Scaffold project with Split-Screen layout: Left = Control Sidebar, Middle = Primary Viewport, Bottom = Iterated Limits Dock.
- Implement Module 1: 2D Curve plotter using Canvas API or SVG.
- Support input of curves (y = f(x), x = g(y)). Compute intersections and shade the enclosed area.
- Add toggle for Region Type T1 (vertical arrow sweep from y_min to y_max) and Type T2 (horizontal arrow sweep from x_min to x_max).
- Display the resulting iterated integral formula in KaTeX.

#### PHASE 2: MODULE 3 (3D Triple Integrals - Cartesian)
- Build the 3D Three.js scene with OrbitControls, axes grid (XYZ color-coded), and lighting.
- Implement surface rendering for planes, paraboloids, cylinders, spheres, and cones.
- Implement intersection clipping using `three-bvh-csg` to generate the bounded solid with configurable transparency.
- Add interactive "Piercing Arrow" (Techo y Piso): A vertical or directional vector showing entry surface and exit surface based on selected order (dz dy dx, dx dz dy, etc.).
- Add side-by-side synchronized 2D projection canvas showing the region shadow R'.

#### PHASE 3: MODULE 2 & 4 (Variable Changes)
- Module 2: Dual 2D Canvas for Polar Coordinates (xy-plane vs r-theta plane) and Elliptic Polars.
- Module 4: Cylindrical and Spherical coordinate guides in 3D:
  - Display the rho vector, phi opening cone (from +z axis down), and theta sweep in the xy-plane.
  - Display standard coordinate transformation Jacobians in the dock.

Begin with Phase 1, ensure clean TypeScript types as specified in the PRD, and produce a working responsive interface.

```