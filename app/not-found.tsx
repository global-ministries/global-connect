export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Página no encontrada</h1>
        <p className="mt-2 text-muted-foreground">La página solicitada no existe o fue movida.</p>
      </div>
    </div>
  )
}
