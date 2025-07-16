"""Add two dummy posts to the `posts` collection for the `candelora` tenant.

Usage:
    python scripts/add_test_posts.py --url http://localhost:3000 --email YOUR_ADMIN_EMAIL --password YOUR_PASSWORD

The script authenticates with Payload, obtains a JWT, and then creates two posts via the REST API.
"""

import argparse
import sys
from typing import Dict

import requests


def login(base_url: str, email: str, password: str) -> str:
    resp = requests.post(
        f"{base_url}/api/users/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("token")


def create_post(base_url: str, token: str, data: Dict):
    headers = {"Authorization": f"JWT {token}"}
    resp = requests.post(f"{base_url}/api/posts", json=data, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Add dummy posts to Payload CMS")
    parser.add_argument("--url", required=True, help="Base URL of Payload instance, e.g. http://localhost:3000")
    parser.add_argument("--email", required=True, help="Admin user email")
    parser.add_argument("--password", required=True, help="Admin user password")
    args = parser.parse_args()

    try:
        token = login(args.url, args.email, args.password)
    except Exception as err:
        print(f"Login failed: {err}")
        sys.exit(1)

    posts = [
        {
            "title": "Test Post 1",
            "slug": "test-post-1",
            "tenant": "candelora",
            "content": {
                "root": {
                    "type": "root",
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "version": 1,
                            "children": [
                                {"type": "text", "version": 1, "text": "This is a dummy test post 1."}
                            ]
                        }
                    ]
                }
            },
            "_status": "published",
        },
        {
            "title": "Test Post 2",
            "slug": "test-post-2",
            "tenant": "candelora",
            "content": {
                "root": {
                    "type": "root",
                    "version": 1,
                    "children": [
                        {
                            "type": "paragraph",
                            "version": 1,
                            "children": [
                                {"type": "text", "version": 1, "text": "This is a dummy test post 2."}
                            ]
                        }
                    ]
                }
            },
            "_status": "published",
        },
    ]

    for post in posts:
        try:
            created = create_post(args.url, token, post)
            print(f"Created: {created.get('title')} (id: {created.get('id')})")
        except requests.HTTPError as err:
            print(f"Failed to create {post['title']}: {err.response.status_code} {err.response.text}")
        except Exception as err:
            print(f"Failed to create {post['title']}: {err}")


if __name__ == "__main__":
    main()
