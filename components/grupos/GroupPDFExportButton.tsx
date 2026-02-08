"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { BotonSistema } from "@/components/ui/sistema-diseno";

interface Miembro {
  id: string | number;
  nombre: string;
  apellido: string;
  telefono?: string;
  rol?: string;
}

interface Grupo {
  nombre: string;
  segmento_nombre?: string;
  temporada_nombre?: string;
  dia_reunion?: string;
  hora_reunion?: string;
  miembros?: Miembro[];
}

interface GroupPDFExportButtonProps {
  grupo: Grupo;
}

// Formatea teléfono para mostrar (limpio)
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "Sin teléfono";
  return phone;
}

// Agrupa miembros consecutivos en parejas de 2
// El ordenamiento ya viene de la BD: por rol, luego por pareja (cónyuges juntos), luego por género
function agruparEnParejas(miembros: Miembro[]): Miembro[][] {
  const grupos: Miembro[][] = [];

  for (let i = 0; i < miembros.length; i += 2) {
    if (i + 1 < miembros.length) {
      grupos.push([miembros[i], miembros[i + 1]]);
    } else {
      grupos.push([miembros[i]]);
    }
  }
  return grupos;
}

export default function GroupPDFExportButton({ grupo }: GroupPDFExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const esMatrimonio = grupo.segmento_nombre?.toLowerCase().includes("matrimonio");

  const handleExport = async () => {
    setExporting(true);
    try {
      // Usar el orden que viene de la base de datos (ya ordenado por parejas)
      const miembros = grupo.miembros || [];

      // Generar contenido HTML para imprimir
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${grupo.nombre} - Detalles</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            h1 { color: #E96C20; margin-bottom: 5px; }
            .subtitle { color: #666; margin-bottom: 20px; font-size: 14px; }
            .info-row { display: flex; gap: 20px; margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 8px; }
            .info-item { flex: 1; }
            .info-label { font-size: 12px; color: #888; }
            .info-value { font-weight: 600; }
            h2 { color: #363D45; border-bottom: 2px solid #E96C20; padding-bottom: 5px; margin-top: 25px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #363D45; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background: #f9f9f9; }
            .pareja-row { background: #fff3e0 !important; }
            .empty { color: #999; font-style: italic; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${grupo.nombre}</h1>
          <p class="subtitle">${grupo.segmento_nombre || ""} • ${grupo.temporada_nombre || ""}</p>
          
          <div class="info-row">
            <div class="info-item">
              <div class="info-label">Día de reunión</div>
              <div class="info-value">${grupo.dia_reunion || "No definido"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Hora</div>
              <div class="info-value">${grupo.hora_reunion || "No definida"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total miembros</div>
              <div class="info-value">${miembros.length}</div>
            </div>
          </div>
      `;

      if (miembros.length > 0) {
        if (esMatrimonio) {
          // Para matrimonios: mostrar agrupados por pareja
          const parejas = agruparEnParejas(miembros);
          html += `
          <h2>Integrantes (${miembros.length})</h2>
          <table>
            <thead><tr><th>Pareja</th><th>Nombre</th><th>Teléfono</th></tr></thead>
            <tbody>
              ${parejas.map((pareja, idx) => pareja.map((m, i) => `
                <tr class="${i === 0 ? 'pareja-row' : ''}">
                  ${i === 0 ? `<td rowspan="${pareja.length}">Pareja ${idx + 1}</td>` : ''}
                  <td>${m.nombre} ${m.apellido}</td>
                  <td>${formatPhoneDisplay(m.telefono)}</td>
                </tr>
              `).join("")).join("")}
            </tbody>
          </table>
        `;
        } else {
          // Para otros grupos: lista simple
          html += `
          <h2>Integrantes (${miembros.length})</h2>
          <table>
            <thead><tr><th>Nombre</th><th>Teléfono</th></tr></thead>
            <tbody>
              ${miembros.map(m => `
                <tr>
                  <td>${m.nombre} ${m.apellido}</td>
                  <td>${formatPhoneDisplay(m.telefono)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
        }
      } else {
        html += `<p class="empty">No hay miembros en este grupo.</p>`;
      }

      html += `
          <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
            Generado el ${new Date().toLocaleDateString('es-VE', { dateStyle: 'long' })}
          </p>
        </body>
        </html>
      `;

      // Abrir ventana de impresión/PDF
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        // Pequeño delay para que cargue el contenido
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    } catch (error) {
      console.error("Error al exportar PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <BotonSistema
      variante="outline"
      onClick={handleExport}
      disabled={exporting}
      cargando={exporting}
      className="w-full h-10 text-sm"
    >
      <Download className="w-4 h-4" />
      <span className="ml-2">PDF</span>
    </BotonSistema>
  );
}
