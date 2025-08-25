### 1. Calidad y Mantenimiento del C�digo
- **Formato:** Utiliza siempre la tabulaci�n y el formateador de Prettier para formatear el c�digo. El c�digo debe ser consistente.
- **Simplicidad:** Prioriza siempre soluciones simples y legibles. El c�digo debe ser auto-explicativo.
- **Principio DRY (No te Repitas):** Antes de crear una nueva funci�n o componente, revisa si ya existe l�gica similar. Refactoriza en componentes, hooks o utilidades reutilizables.
- ? **Separaci�n de L�gica (Hooks y Utils):** Mant�n los componentes de React (`page.tsx`) lo m�s limpios posible. Externaliza la l�gica de negocio compleja, las llamadas a la API y el manejo de estado a hooks personalizados (ej: `useUsers.ts`) o a funciones en una carpeta `/lib` o `/utils`.
    // Por qu� es importante: Evita componentes gigantescos y hace la l�gica reutilizable y f�cil de testear.
- **Nomenclatura:** Todo el c�digo debe estar en espa�ol, incluyendo comentarios, nombres de variables y funciones, para mantener la coherencia.

### 2. Seguridad y Buenas Pr�cticas
- **Credenciales:** NUNCA escribas claves de API, tokens o cualquier credencial directamente en el c�digo. Utiliza siempre variables de entorno (`process.env`) y gestiona el archivo `.env.local`.
- ? **Manejo de Errores y Estados de Carga:** Todas las operaciones as�ncronas (como llamadas a la base de datos) DEBEN manejar expl�citamente los estados de carga (loading) y los posibles errores. Muestra feedback visual al usuario (spinners, mensajes de error) en lugar de dejar la UI en blanco o romper la aplicaci�n.
    // Por qu� es importante: Mejora dr�sticamente la experiencia de usuario y la robustez.
- **Evoluci�n Controlada:** Al corregir un bug o a�adir una feature, no introduzcas nuevas tecnolog�as sin una raz�n justificada. Prioriza la consistencia del stack tecnol�gico.

### 3. Flujo de Trabajo y Eficiencia
- **Entorno de Desarrollo:** Despu�s de realizar cambios significativos, aseg�rate de que el servidor de desarrollo se reinicia para reflejar los cambios. Mata siempre procesos de servidor hu�rfanos.
- **Iteraci�n sobre Creaci�n:** Busca siempre c�digo existente para iterar sobre �l en lugar de crear nuevo c�digo desde cero.
- **Precisi�n en las Solicitudes:** Aseg�rate de hacer solo los cambios solicitados. No realices cambios no relacionados en el mismo prompt.

### 4. Arquitectura y Reglas Espec�ficas para "Global Connect"
- ? **Prioriza Server Components:** Por defecto, todos los componentes deben ser Server Components para mejorar el rendimiento. Solo convierte un componente a Client Component (`"use client"`) si es estrictamente necesario (si usa hooks como `useState`, `useEffect` o maneja eventos de usuario).
    // Por qu� es importante: Es la pr�ctica recomendada en Next.js 14 para aplicaciones r�pidas y escalables.
- **Formularios:** Para todos los formularios, utiliza `react-hook-form` para el manejo de estado y `zod` para la validaci�n del esquema de datos.
- **Componentes de UI:** Todos los componentes de UI reutilizables y "tontos" (Botones, Tarjetas, Inputs) deben residir en la carpeta `/components/ui`.
- **Interacci�n con la Base de Datos:** Todas las llamadas a Supabase deben usar el cliente oficial (`@supabase/supabase-js`). Siempre que sea posible, utiliza los tipos de TypeScript generados por Supabase para garantizar la seguridad de tipos entre el frontend y la base de datos.
- **Estilo Visual:** Cualquier nuevo componente de UI debe adherirse al estilo visual "Vision OS / Glassmorphism" definido, utilizando clases de Tailwind CSS como `backdrop-blur-2xl`, `rounded-3xl` y gradientes suaves.
- **Idioma:** Always respond in Spanish.