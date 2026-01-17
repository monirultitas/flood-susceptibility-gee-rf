# flood-susceptibility-gee-rf

Flood susceptibility mapping using Random Forest and Google Earth Engine.

---

## Project structure

- `data/`: Vector training samples for LULC and flood inventory.
- `scripts/`: Modular GEE JavaScript files numbered by execution order.
- `outputs/figures/`: Visualizations and preview maps.
- `CITATION.cff`: Citation metadata.
- `LICENSE`: MIT License.

---

## Methodology

### 1. Conditioning factor preparation
Flood conditioning factors were derived using individual GEE scripts representing topographic, hydrological, climatic, land-use, and soil characteristics. Variables include:

- Elevation
- Slope
- Profile curvature
- Stream Power Index (SPI)
- Topographic Wetness Index (TWI)
- Distance from river
- Precipitation
- Soil type
- Land Use / Land Cover (LULC)
- Historical flood occurrence

All factors were generated at a consistent spatial resolution and spatially aligned. Finalized layers were exported and stored as Earth Engine Assets to ensure computational efficiency and reproducibility.

### 2. LULC classification
Land Use / Land Cover for the year 2024 was classified using a Random Forest classifier. Training samples were prepared as vector data and are included in `data/reference/`.
- **Script:** `LULC_training_samples_Sylhet_2024.geojson`

### 3. Flood susceptibility modeling
The modeling was performed using a Random Forest classifier. Historical flood occurrence data were used for training samples, while the derived conditioning factors served as predictor variables.

**Modeling script:** `scripts/Flood_Susceptibility.js`

This script integrates the following steps:
- Loads conditioning factor layers.
- Stacks predictor variables.
- Trains the Random Forest model.
- Applies the model across the study area.
- Exports the final susceptibility map.

---

## Data description

### Training data
- **Historical Flood Training Data:** Vataset representing flooded and non-flooded locations used for model training. 
  - Location: `data/training/`
- **LULC Training Samples:** Vector training samples used for the 2024 LULC classification. 
  - Location: `data/reference/`

*Note: Raster outputs included in the repository only for flood susceptibility map.*



## Results preview

![Flood Susceptibility Map](outputs/figures/Figure 1 Final flood susceptibility map)
*Figure 1: Final flood susceptibility map.jpg.*

---

## Reproducibility
Conditioning factors are derived independently, while the main modeling script integrates all layers to generate the final output. 

To reproduce the results:
1. Upload the data derived from `script/` to your GEE Assets.
2. Update the asset IDs in the scripts to point to your user directory.
3. Run scripts.

---

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contact
**Monirul Islam** Jahangirnagar University  
Email: monirtitas@gmail.com
