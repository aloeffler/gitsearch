# GitHub Search

A service with a single API entry point to search for GitHub users by
the programming language they use in their public repositories.

## Description

Search public user repositories of GitHub for a specified language and retrieve
username, full name, avatar URL and followers.

The service is implemented for Node.js in JavaScript using an Express server running on port 3000.

## Installation

Build the service using the provided Dockerfile:

```
docker build -t gitsearch .
```

Run the service and expose the application port 3000 to the desired internal port:

```
docker run -p <internal_port>:3000 -d gitsearch
```

## Usage

Parameters:
- lang:  Language to search for
- size:  Number of record to retrieve (default: 50, max: 1000)
- token: GitHub perosonal access token

Result:
- JSON array:

```
[
   {
      login: 'Username',
      name: 'Full Name',
      avatar_url: 'Avatar URL',
      followers: nb_of_followers
   }, ...
]
```

Generate a GitHub personal access token with the "public_repo" scope set
to increase the search limit from 30 to 5000.

Search 300 users that use JavaScript:

```
http://localhost:<internal_port>/?lang=javascript&size=300&token=<github_access_token>
```

Search the first 50 users that use C:

```
http://localhost:<internal_port>/?lang=c&token=<github_access_token>
```
