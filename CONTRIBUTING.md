### 1. Calidad y Mantenimiento del Código
- **Formato:** Utiliza siempre la tabulación y el formateador de Prettier para formatear el código. El código debe ser consistente.
- **Simplicidad:** Prioriza siempre soluciones simples y legibles. El código debe ser auto-explicativo.
- **Principio DRY (No te Repitas):** Antes de crear una nueva función o componente, revisa si ya existe lógica similar. Refactoriza en componentes, hooks o utilidades reutilizables.
- ? **Separación de Lógica (Hooks y Utils):** Mantén los componentes de React (`page.tsx`) lo más limpios posible. Externaliza la lógica de negocio compleja, las llamadas a la API y el manejo de estado a hooks personalizados (ej: `useUsers.ts`) o a funciones en una carpeta `/lib` o `/utils`.
    // Por qué es importante: Evita componentes gigantescos y hace la lógica reutilizable y fácil de testear.
- **Nomenclatura:** Todo el código debe estar en español, incluyendo comentarios, nombres de variables y funciones, para mantener la coherencia.

### 2. Seguridad y Buenas Prácticas
- **Credenciales:** NUNCA escribas claves de API, tokens o cualquier credencial directamente en el código. Utiliza siempre variables de entorno (`process.env`) y gestiona el archivo `.env.local`.
- ? **Manejo de Errores y Estados de Carga:** Todas las operaciones asíncronas (como llamadas a la base de datos) DEBEN manejar explícitamente los estados de carga (loading) y los posibles errores. Muestra feedback visual al usuario (spinners, mensajes de error) en lugar de dejar la UI en blanco o romper la aplicación.
    // Por qué es importante: Mejora drásticamente la experiencia de usuario y la robustez.
- **Evolución Controlada:** Al corregir un bug o añadir una feature, no introduzcas nuevas tecnologías sin una razón justificada. Prioriza la consistencia del stack tecnológico.

### 3. Flujo de Trabajo y Eficiencia
- **Entorno de Desarrollo:** Después de realizar cambios significativos, asegúrate de que el servidor de desarrollo se reinicia para reflejar los cambios. Mata siempre procesos de servidor huérfanos.
- **Iteración sobre Creación:** Busca siempre código existente para iterar sobre él en lugar de crear nuevo código desde cero.
- **Precisión en las Solicitudes:** Asegúrate de hacer solo los cambios solicitados. No realices cambios no relacionados en el mismo prompt.

### 4. Arquitectura y Reglas Específicas para "Global Connect"
- ? **Prioriza Server Components:** Por defecto, todos los componentes deben ser Server Components para mejorar el rendimiento. Solo convierte un componente a Client Component (`"use client"`) si es estrictamente necesario (si usa hooks como `useState`, `useEffect` o maneja eventos de usuario).
    // Por qué es importante: Es la práctica recomendada en Next.js 14 para aplicaciones rápidas y escalables.
- **Formularios:** Para todos los formularios, utiliza `react-hook-form` para el manejo de estado y `zod` para la validación del esquema de datos.
- **Componentes de UI:** Todos los componentes de UI reutilizables y "tontos" (Botones, Tarjetas, Inputs) deben residir en la carpeta `/components/ui`.
- **Interacción con la Base de Datos:** Todas las llamadas a Supabase deben usar el cliente oficial (`@supabase/supabase-js`). Siempre que sea posible, utiliza los tipos de TypeScript generados por Supabase para garantizar la seguridad de tipos entre el frontend y la base de datos.
- **Estilo Visual:** Cualquier nuevo componente de UI debe adherirse al estilo visual "Vision OS / Glassmorphism" definido, utilizando clases de Tailwind CSS como `backdrop-blur-2xl`, `rounded-3xl` y gradientes suaves.
- **Idioma:** Always respond in Spanish.