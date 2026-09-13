# Herramientas auxiliares Python

Solo biblioteca estándar. No implementan estados, pagos, roles ni el mock de Byetery.

Desde la raíz del repositorio:

```powershell
python tools/python/generate_demo_data.py --count 10 --seed 42 --output .demo-data/batteries.json
python tools/python/verify_payload_hash.py .demo-data/batteries.json
python tools/python/verify_payload_hash.py archivo.json --expected HASH_SHA256_DE_64_CARACTERES
python -m unittest discover -s tools/python -p "test_*.py" -v
```

La misma semilla produce metadatos ficticios reproducibles. Los IDs son para demos,
no reservas ni registros reales. Nunca genera claves privadas o request_id reales.
Los request_id del flujo usan el CSPRNG del backend existente.

El hash se calcula sobre los bytes exactos, incluidos espacios y saltos de línea.
Un JSON con otro formato puede tener otro hash. Esto no sustituye la canonicalización
del manifiesto ni el compromiso exterior Soroban/XDR, que permanece en TypeScript.
El verificador devuelve 0 si coincide, 1 si no coincide y 2 para entradas inválidas.
