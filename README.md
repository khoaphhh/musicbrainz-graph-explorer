# MusicBrainz Graph Explorer

A web application for exploring the network of relationships between music artists, using data from the MusicBrainz Database.

<p align="center">
  <img src="docs/logo.png" width="600"
</p>

## Features

- Search for artists by name – supports non-diacritic and multilingual input
- Display a graph showing first-degree and all internal relationships with drag-and-drop interaction
- View detailed relationship information between two artists (relationship type, collaborative songs)
- Find paths between two or more artists

## Tech Stack

- **Backend:** Flask, NetworkX, psycopg2
- **Database:** PostgreSQL
- **Frontend:** Cytoscape.js, JavaScript
- **Data source:** MusicBrainz Database Dump

## Database Schema

<p align="center">
  <img src="docs/erd.png" width="800"
</p>

## System requirements

- Python 3.11+
- PostgreSQL 14+

## Demo

- Search for an artist
<p align="center">
  <img src="docs/search.gif" width="800"
</p>

- Adjust the number of artists on the graph
<p align="center">
  <img src="docs/adjust.gif" width="800"
</p>

- Display information about the relationships between two artists.
<p align="center">
  <img src="docs/relations.gif" width="800"
</p>

- Display the next artist and return to the previous artist.
<p align="center">
  <img src="docs/history.gif" width="800"
</p>

- Find connecting paths between multiple artists.
<p align="center">
  <img src="docs/path.gif" width="800"
</p>

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Data Attribution

Data from [MusicBrainz](https://musicbrainz.org) (CC0).