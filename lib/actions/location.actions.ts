"use server"

export async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY_SERVER;
  if (!apiKey) {
    throw new Error('Clave de API de Google Maps no configurada');
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return { success: false, error: `Error en geocodificación: ${data.status}` };
    }

    if (!data.results || data.results.length === 0) {
      return { success: false, error: 'Dirección no encontrada' };
    }

    const location = data.results[0].geometry.location;
    return { success: true, lat: location.lat, lng: location.lng };
  } catch (error) {
    console.error('Error al geocodificar dirección:', error);
    return { success: false, error: 'Error interno al geocodificar' };
  }
}
