console.log("script.js cargado correctamente");
console.log(typeof ObtenerMetadatosArchivo);
function Base64UrlDecode(input) {
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

    while (base64.length % 4 !== 0) {
        base64 += '=';
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

async function ObtenerMetadatosArchivo(url) {

    // 1. Extraer ID y clave del enlace
    const match = url.match(
        /mega\.(?:nz|io)\/file\/([^#/?]+)#([^&]+)/
    );

    if (!match) {
        throw new Error("URL de archivo MEGA invalida.");
    }

    const id_archivo = match[1];
    const clave_cifrado = match[2];

    // 2. Decodificar clave Base64URL
    const key = Base64UrlDecode(clave_cifrado);

    if (key.length !== 32) {
        throw new Error("La clave debe tener 32 bytes.");
    }

    // 3. Obtener clave AES
    const aesKey = new Uint8Array(16);

    for (let i = 0; i < 16; i++) {
        aesKey[i] = key[i] ^ key[i + 16];
    }

    // 4. Consultar API de MEGA
    const apiUrl = "https://g.api.mega.co.nz/cs?domain=meganz&lang=en";

    const payload = [{
        a: "g",
        g: 1,
        ssl: 0,
        p: id_archivo
    }];

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error("Error HTTP: " + response.status);
    }

    const data = await response.json();
    const item = data[0];

    if (typeof item === "number") {
        throw new Error("Error de API MEGA: " + item);
    }

    if (!item || !item.at) {
        throw new Error("La API no devolvio el atributo cifrado.");
    }

    // 5. Decodificar atributos cifrados
    const encrypted = Base64UrlDecode(item.at);

    if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
        throw new Error("Longitud del atributo cifrado invalida.");
    }

    // 6. Descifrar atributos AES-CBC
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        aesKey,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-CBC",
            iv: new Uint8Array(16)
        },
        cryptoKey,
        encrypted
    );

    // 7. Obtener atributos
    const bytes = new Uint8Array(decrypted);

    let plainText = new TextDecoder("utf-8").decode(bytes);

    plainText = plainText.replace(/\0+$/, "");

    if (!plainText.startsWith("MEGA")) {
        throw new Error("No se pudieron descifrar los atributos.");
    }

    const attributes = JSON.parse(plainText.substring(4));

    const nombre = attributes.n;
    const tamanio = Number(item.s);

    // 8. Devolver metadatos
    return {
        id_archivo,
        nombre,
        tamanio,
        clave_cifrado,
        aesKey
    };
}
