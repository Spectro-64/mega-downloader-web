
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mega.nz Downloader Web</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <h1>Mega.nz Downloader Web</h1>

    <input
        type="text"
        id="megaUrl"
        placeholder="Pegá tu enlace de MEGA"
    >

    <button id="downloadBtn">Obtener metadatos</button>

    <pre id="resultado"></pre>

    <script src="script.js"></script>

    <script>
        document.getElementById("downloadBtn").addEventListener("click", async () => {

            const url = document.getElementById("megaUrl").value.trim();
            const resultado = document.getElementById("resultado");

            try {
                resultado.textContent = "Consultando MEGA...";

                const datos = await window.ObtenerMetadatosArchivo(url);

                resultado.textContent =
                    "ID: " + datos.id_archivo + "\n" +
                    "Nombre: " + datos.nombre + "\n" +
                    "Tamaño: " + datos.tamanio + " bytes\n" +
                    "Clave AES: " +
                    Array.from(datos.aesKey)
                        .map(b => b.toString(16).padStart(2, "0"))
                        .join("");

            } catch (error) {
                console.error(error);
                resultado.textContent = "Error: " + error.message;
            }

        });
    </script>

</body>
</html>
