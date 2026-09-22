import json


print(
    json.dumps(
        {
            "schema_version": "1.0",
            "scenario": "s06-typescript-accessor-canary",
            "behavior": {"purpose": "disposable hosted S06 qualification"},
        },
        sort_keys=True,
    )
)
