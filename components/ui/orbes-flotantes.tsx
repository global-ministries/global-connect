export function OrbesFlotantes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-xl animate-pulse"></div>
      <div
        className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-blue-400/25 to-purple-400/25 rounded-full blur-lg animate-bounce"
        style={{ animationDuration: "3s" }}
      ></div>
      <div
        className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-pink-300/20 to-purple-300/20 rounded-full blur-2xl animate-pulse"
        style={{ animationDelay: "1s" }}
      ></div>
      <div
        className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-indigo-400/30 to-blue-400/30 rounded-full blur-xl animate-bounce"
        style={{ animationDuration: "4s", animationDelay: "0.5s" }}
      ></div>
      <div
        className="absolute top-1/2 left-10 w-20 h-20 bg-gradient-to-br from-purple-500/25 to-pink-500/25 rounded-full blur-lg animate-pulse"
        style={{ animationDelay: "2s" }}
      ></div>
      <div
        className="absolute top-1/3 right-10 w-36 h-36 bg-gradient-to-br from-lavender-400/20 to-purple-400/20 rounded-full blur-2xl animate-bounce"
        style={{ animationDuration: "5s" }}
      ></div>
    </div>
  )
}
