# 📸 Sistema de Fotos de Perfil - Guía de Configuración

## 🎯 Descripción General

Sistema completo de fotos de perfil que permite a los usuarios:
- Subir fotos mediante drag & drop
- Tomar selfies con la cámara del dispositivo
- Redimensionado automático y optimización
- Eliminación segura de fotos anteriores
- Avatares con iniciales como fallback

## 🛠️ Configuración Requerida

### 1. Base de Datos

Ejecutar la migración para agregar el campo de foto de perfil:

```sql
-- Ejecutar en Supabase SQL Editor
\i database/migrations/add_profile_photo_field.sql
```

### 2. Supabase Storage

Configurar el bucket para almacenar las fotos:

```sql
-- Ejecutar en Supabase SQL Editor
\i database/storage/setup_profile_photos_bucket.sql
```

### 3. Variables de Entorno

Asegúrate de que estas variables estén configuradas en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

## 📁 Estructura de Archivos

```
components/
├── ui/
│   ├── ProfilePhotoUploader.tsx  # Componente principal de subida
│   └── UserAvatar.tsx           # Componente de avatar con fallback
lib/
├── actions/
│   └── photo.actions.ts         # Server Actions para manejo de fotos
database/
├── migrations/
│   └── add_profile_photo_field.sql
└── storage/
    └── setup_profile_photos_bucket.sql
```

## 🚀 Uso de Componentes

### ProfilePhotoUploader

```tsx
import { ProfilePhotoUploader } from '@/components/ui/ProfilePhotoUploader'

<ProfilePhotoUploader
  currentPhotoUrl={usuario?.foto_perfil_url}
  size="lg"
  onPhotoChange={(newPhotoUrl) => {
    // Callback cuando cambia la foto
    console.log('Nueva foto:', newPhotoUrl)
  }}
/>
```

**Props:**
- `currentPhotoUrl`: URL actual de la foto
- `size`: Tamaño del componente ('sm' | 'md' | 'lg')
- `onPhotoChange`: Callback cuando cambia la foto
- `className`: Clases CSS adicionales

### UserAvatar

```tsx
import { UserAvatar, UserAvatarWithInfo } from '@/components/ui/UserAvatar'

// Avatar simple
<UserAvatar
  photoUrl={usuario.foto_perfil_url}
  nombre={usuario.nombre}
  apellido={usuario.apellido}
  size="md"
/>

// Avatar con información
<UserAvatarWithInfo
  photoUrl={usuario.foto_perfil_url}
  nombre={usuario.nombre}
  apellido={usuario.apellido}
  email={usuario.email}
  size="md"
  showInfo={true}
  infoPosition="right"
/>
```

## 🔒 Seguridad

### Políticas RLS Implementadas

1. **Tabla usuarios:**
   - Los usuarios pueden ver fotos de perfil según permisos de roles
   - Solo pueden actualizar su propia foto

2. **Storage bucket:**
   - Los usuarios solo pueden subir a su propia carpeta (`user_id/`)
   - Solo pueden modificar/eliminar sus propias fotos
   - Las fotos son públicamente visibles (naturaleza de fotos de perfil)

### Validaciones

- **Tamaño máximo:** 5MB por archivo
- **Tipos permitidos:** JPEG, JPG, PNG, WebP
- **Redimensionado:** Máximo 800x800px manteniendo aspect ratio
- **Calidad:** 80% para optimizar tamaño

## 📱 Funcionalidades

### Drag & Drop
- Arrastra archivos directamente al área de subida
- Validación automática de tipo y tamaño
- Feedback visual durante el arrastre

### Cámara/Selfie
- Acceso a cámara frontal por defecto
- Captura en tiempo real
- Procesamiento automático de la imagen

### Optimización
- Redimensionado automático para web
- Compresión JPEG con calidad 80%
- Eliminación automática de fotos anteriores

### Fallbacks
- Iniciales con colores únicos por usuario
- Icono genérico si no hay nombre
- Manejo de errores de carga de imagen

## 🔧 Personalización

### Tamaños Disponibles

```tsx
const sizeConfig = {
  xs: '24px',   // w-6 h-6
  sm: '32px',   // w-8 h-8
  md: '40px',   // w-10 h-10
  lg: '48px',   // w-12 h-12
  xl: '64px',   // w-16 h-16
  '2xl': '80px' // w-20 h-20
}
```

### Colores de Fallback

Los avatares con iniciales usan 10 colores predefinidos:
- Rojo, Azul, Verde, Amarillo, Púrpura
- Rosa, Índigo, Teal, Naranja, Cian

El color se asigna basado en un hash del nombre completo.

## 🐛 Troubleshooting

### Error: "No se pudo acceder a la cámara"
- Verificar permisos del navegador
- Usar HTTPS en producción
- Comprobar que el dispositivo tenga cámara

### Error: "Archivo demasiado grande"
- Verificar límite de 5MB
- Considerar comprimir la imagen antes de subir

### Error: "Tipo de archivo no permitido"
- Solo se permiten: JPEG, JPG, PNG, WebP
- Verificar extensión del archivo

### Fotos no se muestran
- Verificar configuración del bucket en Supabase
- Comprobar políticas RLS
- Verificar URLs públicas del storage

## 📊 Métricas y Monitoreo

### Logs Importantes
- Subidas exitosas/fallidas
- Errores de validación
- Problemas de acceso a cámara
- Fallos de eliminación de fotos anteriores

### Métricas Sugeridas
- Número de usuarios con foto de perfil
- Tamaño promedio de archivos subidos
- Tipos de archivo más utilizados
- Errores más comunes

## 🚀 Próximas Mejoras

- [ ] Soporte para múltiples fotos por usuario
- [ ] Filtros y efectos para fotos
- [ ] Integración con servicios de moderación de contenido
- [ ] Compresión más avanzada (WebP automático)
- [ ] Soporte para GIFs animados
- [ ] Historial de fotos anteriores
