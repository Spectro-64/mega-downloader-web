// 1. Decodificar Base64URL a Uint8Array
function base64UrlDecode(inputString) {
    let base64 = inputString.replace(/-/g, '+').replace(/_/g, '/');
    
    const pad = base64.length % 4;
    if (pad === 2) base64 += '==';
    else if (pad === 3) base64 += '=';

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// 2. Descifrar AES-128-CBC sin padding usando Web Crypto API
async function decryptAesCbcNoPadding(aesKeyBytes, encryptedBytes) {
    const iv = new Uint8Array(16); // IV de 16 bytes en cero

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        aesKeyBytes,
        { name: "AES-CBC" },
        false,
        ["encrypt", "decrypt"]
    );

    // Web Crypto exige padding PKCS#7 al descifrar.
    // Generamos un bloque extra cifrado con el último bloque como IV para simular "PaddingMode.None".
    const lastBlock = encryptedBytes.slice(encryptedBytes.length - 16);
    const dummyEncrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv: lastBlock },
        cryptoKey,
        new Uint8Array(0) // Genera exactamente 16 bytes de padding PKCS#7 cifrado
    );

    // Concatenamos los datos reales + el bloque de padding válido
    const combined = new Uint8Array(encryptedBytes.length + 16);
    combined.set(encryptedBytes);
    combined.set(new Uint8Array(dummyEncrypted).slice(0, 16), encryptedBytes.length);

    // Desciframos todo junto; Web Crypto valida el último bloque y nos devuelve los datos intactos
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv },
        cryptoKey,
        combined
    );

    return new Uint8Array(decryptedBuffer);
}

// 3. Función principal equivalente a ObtenerMetadatosArchivo
async function obtenerMetadatosArchivo(url) {
    // Extraer ID y clave (soporta mega.nz y mega.io)
    const match = url.match(/mega\.(?:nz|io)\/file\/([^#/?]+)#([^&\s]+)/i);

    if (!match) {
        throw new Error("URL de archivo MEGA inválida. Asegurate de incluir la clave (#...).");
    }

    const id_archivo = match[1];
    const clave_cifrado = match[2];

    // Decodificar clave Base64URL
    const key = base64UrlDecode(clave_cifrado);

    if (key.length !== 32) {
        throw new Error("La clave del enlace debe tener 32 bytes.");
    }

    // Obtener clave AES (XOR entre los primeros 16 bytes y los últimos 16)
    const aesKey = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        aesKey[i] = key[i] ^ key[i + 16];
    }

    // Consultar API de MEGA
    const apiUrl = "https://g.api.mega.co.nz/cs?domain=meganz&lang=en";
    const payload = JSON.stringify([{ a: "g", g: 1, ssl: 0, p: id_archivo }]);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain;charset=UTF-8"
        },
        body: payload
    });

    if (!response.ok) {
        throw new Error(`Error HTTP al conectar con MEGA: ${response.status}`);
    }

    const data = await response.json();
    const item = data[0];

    if (typeof item === "number") {
        throw new Error(`La API de MEGA devolvió el código de error: ${item}`);
    }

    if (!item || !item.at) {
        throw new Error("La API no devolvió el atributo cifrado 'at'.");
    }

    // Decodificar atributos cifrados
    const encrypted = base64UrlDecode(item.at);

    if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
        throw new Error("Longitud del atributo cifrado inválida.");
    }

    // Descifrar atributos AES
    const plainBytes = await decryptAesCbcNoPadding(aesKey, encrypted);
    const decoder = new TextDecoder("utf-8");
    const plainText = decoder.decode(plainBytes).replace(/\0+$/g, '');

    if (!plainText.startsWith("MEGA")) {
        throw new Error("No se pudieron descifrar los atributos. Verificá que la clave esté completa.");
    }

    // Parsear JSON interno
    const jsonText = plainText.substring(4);
    const attributes = JSON.parse(jsonText);

    return {
        id_archivo: id_archivo,
        nombre: attributes.n,
        tamanio: item.s,
        clave_cifrado: clave_cifrado,
        aesKey: aesKey
    };
}

// 4. Manejo del evento en la interfaz
document.getElementById("downloadBtn").addEventListener("click", async () => {
    const url = document.getElementById("megaUrl").value.trim();
    const resultado = document.getElementById("resultado");
    const btn = document.getElementById("downloadBtn");

    if (!url) {
        resultado.textContent = "Por favor, pegá un enlace de MEGA primero.";
        return;
    }

    try {
        btn.disabled = true;
        resultado.textContent = "Consultando API de MEGA y descifrando...";

        const datos = await obtenerMetadatosArchivo(url);
        const aesHex = Array.from(datos.aesKey)
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        resultado.textContent =
            `ID: ${datos.id_archivo}\n` +
            `Nombre: ${datos.nombre}\n` +
            `Tamaño: ${datos.tamanio.toLocaleString('es-AR')} bytes\n` +
            `Clave cifrado: ${datos.clave_cifrado}\n` +
            `Clave AES: ${aesHex}`;

    } catch (error) {
        resultado.textContent = "Error: " + error.message;
    } finally {
        btn.disabled = false;
    }
});
