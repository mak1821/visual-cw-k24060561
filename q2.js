// Global variables used throughout the visualization for managing state and data
let olympicData = [];      // Raw Olympic medal data from CSV
let gdpData = [];         // Country-wise GDP information
let worldMap;            // World map GeoJSON data
let currentYear = 2000;  // Currently selected Olympic year
let processedData = [];  // Combined and processed dataset
let colorScale;          // Color scale for choropleth visualization
let svg;                // Main SVG container for the map
let zoom;              // Zoom behavior controller
let legendGroup;       // Container for the map legend
let active = d3.select(null);  // Currently active country selection
let lastClicked = null;       // Reference to last clicked country
let currentlyHoveredISO = null;

// Color constant and country name mappings for data consistency
const NOT_PARTICIPATED_COLOR = '#888';  // Default color for non-participating countries
const countryAliasMap = {
    // Country name mappings to standardize different naming conventions
    // between Olympic and GDP datasets
    "Bolivia": "BOL",
    "Czech Republic": "CZE",
    "Democratic Republic of the Congo": "COD",
    "Republic of the Congo": "COG",
    "East Timor": "TLS",
    "Ivory Coast": "CIV",
    "Laos": "LAO",
    "Moldova": "MDA",
    "South Korea": "KOR",
    "North Korea": "PRK",
    "Syria": "SYR",
    "Swaziland": "SWZ",
    "Tanzania": "TZA",
    "United Kingdom": "GBR",
    "Venezuela": "VEN",
    "Vietnam": "VNM",
    "Iran": "IRN",
    "Micronesia": "FSM",
    "Eswatini": "SWZ",
    "Bahamas": "BHS",
    "Gambia": "GMB",
    "Brunei": "BRN",
    "Guinea Bissau": "GNB",
    "Macedonia": "MKD",
    "North Macedonia": "MKD",
    "England": "GBR",
    "Russia": "RUS",
    "Republic of Serbia": "SRB",
    "Turkey": "TUR",
    "The Bahamas": "BHS",
    "South Sudan": "SSD",
    "Taiwan": "TPE",
    "United Republic of Tanzania": "TZA",
    "USA": "USA",
};

// Timeline configuration for the visualization
const OLYMPIC_YEARS = [
    1896, 1900, 1904, 1908, 1912,
    1920, 1924, 1928, 1932, 1936,
    1948, 1952, 1956, 1960, 1964,
    1968, 1972, 1976, 1980, 1984,
    1988, 1992, 1996, 2000, 2004,
    2008, 2012, 2016, 2020
];

const FILTERED_OLYMPIC_YEARS = OLYMPIC_YEARS.filter(y => y >= 1950);

// Data Loading and Processing
// Load required datasets asynchronously:
// - Olympic medal data with country codes
// - GDP data for economic context
// - World map GeoJSON for visualization
Promise.all([
    d3.csv('Modified Datasets/olympics_with_iso_flags_final.csv')
        .catch(error => {
            console.error('Error loading Olympic data:', error);
            return [];
        }),
    d3.csv('Modified Datasets/GDP_Combined_Dataset.csv')
        .catch(error => {
            console.error('Error loading GDP data:', error);
            return [];
        }),
    d3.json('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        .catch(error => {
            console.error('Error loading world map:', error);
            return null;
        })
]).then(([olympicData, gdpData, world]) => {
    // Validation of data integrity before processing
    if (!olympicData.length || !gdpData.length || !world) {
        console.error('Failed to load one or more required datasets');
        document.getElementById('choroplethMap').innerHTML = 
            '<p style="color: red; text-align: center; margin-top: 20px;">' +
            'Error loading data. Please check if the data files exist in the correct location.</p>';
        return;
    }

    // Processing Olympic medal data with duplicate handling for team events
    const medalCounts = new Map();
    const uniqueMedals = new Set();
    
    // Filteration and aggregation of medal data
    olympicData.filter(row =>
        row.Medal !== 'No medal' &&
        row.iso_code &&
        row.iso_code.trim() !== '' &&
        row.Event &&
        row.Year
    ).forEach(row => {
        const iso = row.iso_code.trim();
        const year = row.Year;
        const medal = row.Medal.trim();
        const event = row.Event.trim();
        const uniqueKey = `${iso}-${year}-${event}-${medal}`;

        if (uniqueMedals.has(uniqueKey)) return;
        uniqueMedals.add(uniqueKey);
    
        const countryYearKey = `${iso}-${year}`;
        if (!medalCounts.has(countryYearKey)) {
            medalCounts.set(countryYearKey, { gold: 0, silver: 0, bronze: 0 });
        }
    
        const counts = medalCounts.get(countryYearKey);
        if (medal === 'Gold') counts.gold++;
        else if (medal === 'Silver') counts.silver++;
        else if (medal === 'Bronze') counts.bronze++;
    
        medalCounts.set(countryYearKey, counts);
    });

    console.log('Medal counts processed:', medalCounts.size);
    console.log('Sample medal data:', Array.from(medalCounts.entries()).slice(0, 5));

    // Processing GDP data, filtering for valid entries
    const gdpByCountry = new Map();
    gdpData.forEach(row => {
        if (row.iso_code && row.iso_code.length === 3) {
            const key = `${row.iso_code}-${row.year}`;
            const gdppc = parseFloat(row.gdppc);
            const population = Math.min(parseFloat(row.population), 200_000_000);  // Get actual population from data
            if (!isNaN(gdppc) && gdppc > 0 && !isNaN(population) && population > 0) {
                gdpByCountry.set(key, {
                    gdpPerCapita: gdppc,
                    population: 1_000_000 
                });
            }
        }
    });

    console.log('GDP data processed:', gdpByCountry.size);
    console.log('Sample GDP data:', Array.from(gdpByCountry.entries()).slice(0, 5));


    // Combining Olympic and GDP data
    const allKeys = new Set();
    gdpData.forEach(row => {
        if (row.iso_code && row.year) {
            const key = `${row.iso_code}-${row.year}`;
            allKeys.add(key);
        }
    });
    olympicData.forEach(row => {
        if (row.iso_code && row.Year) {
            const key = `${row.iso_code}-${row.Year}`;
            allKeys.add(key);
        }
    });

    // Create Country Name Mappings
    const olympicNameByISO = new Map();
    const gdpNameByISO = new Map();
    olympicData.forEach(d => {
        if (d.iso_code && d.iso_country_name) {
            olympicNameByISO.set(d.iso_code, d.iso_country_name);
        }
    });

    gdpData.forEach(d => {
        if (d.iso_code && d.country) {
            gdpNameByISO.set(d.iso_code, d.country);
        }
    });

    // Olympic participation history
    const participationSet = new Set();
    olympicData.forEach(row => {
        if (row.iso_code &&
            row.iso_code.trim() !== '' &&
            row.Event &&
            row.Year
        ) {
            const iso = row.iso_code.trim();
            const year = row.Year;
            participationSet.add(`${iso}-${year}`);
        }
    });
    window.participationSet = participationSet;

    // Medal performance in relation to GDP and population
    processedData = Array.from(allKeys)
        .map(key => {
            const [iso_code, year] = key.split('-');
            const gdpInfo = gdpByCountry.get(key);
            const medalCount = medalCounts.get(key) || { gold: 0, silver: 0, bronze: 0 };
            const totalMedals = medalCount.gold + medalCount.silver + medalCount.bronze;

            if (!gdpInfo) return null;

            const gdpPerCapita = gdpInfo.gdpPerCapita;
            const population = gdpInfo.population;

            if (!population || population <= 0 || !gdpPerCapita || gdpPerCapita <= 0) return null;

            const medalsPerMillion = totalMedals / (population / 1_000_000);
            const efficiency = medalsPerMillion / gdpPerCapita;
            const logEfficiency = Math.log10(efficiency + 1e-6);  // small constant added to handle zero values

            const countryName = olympicNameByISO.get(iso_code) ||
                gdpNameByISO.get(iso_code) ||
                iso_code;

            return {
                year: +year,
                iso_code,
                country: countryName,
                medals: medalCount,
                totalMedals,
                population,
                gdpPerCapita,
                medalsPerMillion,
                efficiency,
                logEfficiency
            };
        })
        .filter(d => d !== null && d.country);

    window.yearData = processedData.filter(d => d.year === currentYear);
    console.log('Combined data processed:', processedData.length);
    console.log('Sample processed data:', processedData.slice(0, 5));

    // Visualization components
    const yearSlider = document.getElementById('yearSlider');
    const availableYears = [...new Set(processedData.map(d => d.year))].sort();
    console.log('Available years:', availableYears);

    currentYear = availableYears[availableYears.length - 1];
    document.getElementById('currentYear').textContent = currentYear;

    yearSlider.min = 0;
    yearSlider.max = FILTERED_OLYMPIC_YEARS.length - 1;
    yearSlider.step = 1;
    yearSlider.value = FILTERED_OLYMPIC_YEARS.length - 1;

    currentYear = FILTERED_OLYMPIC_YEARS[yearSlider.value];
    document.getElementById('currentYear').textContent = currentYear;
    worldMap = world;

    // Color scale configuration
    const logEffMin = d3.min(processedData, d => d.logEfficiency);
    const logEffMax = d3.max(processedData, d => d.logEfficiency);

    colorScale = d3.scaleSequential()
        .domain([logEffMin, logEffMax])
        .interpolator(t => d3.interpolateYlGnBu(t * 0.8 + 0.15));  // Sequential color scheme for performance metrics

    console.log("Legend color scale domain:", colorScale.domain());

    initializeChoroplethMap();

    // Year Selection Functionality
    yearSlider.addEventListener('input', function(e) {
        const index = +e.target.value;
        const year = FILTERED_OLYMPIC_YEARS[index];
        currentYear = year;

        document.getElementById('currentYear').textContent = currentYear;
        updateVisualizations();

        if (lastClicked) {
            const iso = d3.select(lastClicked).attr('data-iso');
            if (iso) {
                updateCountryPopup(iso);
            }
        }

        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
            document.getElementById('playToggle').textContent = '▶ Play';
            document.getElementById('playToggle').disabled = false;
        }

        document.getElementById('ariaYear').textContent = `Olympic year selected: ${currentYear}`;
    });

    updateVisualizations();

    // Popup Close Handler
    document.getElementById('popupClose').addEventListener('click', () => {
        document.getElementById('countryPopup').style.display = 'none';

        const resetTransform = d3.zoomIdentity.translate(0, 80);
        svg.transition()
            .duration(750)
            .call(zoom.transform, resetTransform);

        if (lastClicked) {
            const prev = d3.select(lastClicked);
            const prevIso = prev.attr('data-iso');
            const prevData = window.yearData.find(p => p.iso_code === prevIso);
            if (prevData && !isNaN(prevData.logEfficiency)) {
                prev.attr('fill', colorScale(prevData.logEfficiency));
            } else {
                const fallback = prev.attr('data-original-fill') || NOT_PARTICIPATED_COLOR;
                prev.attr('fill', fallback);
            }
            lastClicked = null;
        }
    });

    // Play Animation
    let playInterval = null;
    document.getElementById('playToggle').addEventListener('click', () => {
        if (playInterval) return;

        const playButton = document.getElementById('playToggle');
        playButton.disabled = true;
        playButton.textContent = 'Playing...';

        let index = +yearSlider.value;

        playInterval = setInterval(() => {
            if (index >= FILTERED_OLYMPIC_YEARS.length - 1) {
                clearInterval(playInterval);
                playInterval = null;
                playButton.textContent = '▶';
                playButton.disabled = false;
                return;
            }

            index++;
            yearSlider.value = index;
            currentYear = FILTERED_OLYMPIC_YEARS[index];
            document.getElementById('currentYear').textContent = currentYear;
            updateVisualizations();

            if (lastClicked) {
                const iso = d3.select(lastClicked).attr('data-iso');
                updateCountryPopup(iso);
            }
        }, 600);
    });
});

// Updates country details popup with current metrics and historical trend
function updateCountryPopup(iso) {
    const countryEntry = processedData.find(d => d.iso_code === iso && d.year === currentYear);
    const countryName = countryEntry?.country || iso;
    const gdpPerCapita = countryEntry?.gdpPerCapita || 0;
    const gold = countryEntry?.medals.gold || 0;
    const silver = countryEntry?.medals.silver || 0;
    const bronze = countryEntry?.medals.bronze || 0;

    const totalMedalsByCountry = {};
    processedData
        .filter(d => d.year === currentYear)
        .forEach(d => {
            totalMedalsByCountry[d.iso_code] = d.totalMedals;
        });

    const sortedISO = Object.entries(totalMedalsByCountry)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

    const overallRank = sortedISO.indexOf(iso) + 1;
    const totalCountries = sortedISO.length;

    // Update popup content
    document.getElementById('popupYearHeading').textContent = `Statistics for ${currentYear}`;
    document.getElementById('popupTitle').textContent = countryName;
    const gdpDisplay = countryEntry?.gdpPerCapita
        ? `GDP per Capita: $${Math.round(countryEntry.gdpPerCapita).toLocaleString()}`
        : 'GDP per Capita: N/A';
    document.getElementById('popupRanks').textContent = `Global Ranking (Total Medals): ${overallRank} of ${totalCountries}`;
    document.getElementById('popupGDP').textContent = gdpDisplay;
    document.getElementById('goldCount').textContent = gold;
    document.getElementById('silverCount').textContent = silver;
    document.getElementById('bronzeCount').textContent = bronze;

    // Create line chart data for popup
    const countryData = FILTERED_OLYMPIC_YEARS
        .filter(y => y <= currentYear)
        .map(year => {
            const match = processedData.find(d => d.iso_code === iso && d.year === year);
            return { year, totalMedals: match ? match.totalMedals : 0 };
        });

    // Draw line chart in popup
    const svg = d3.select("#popupChart");
    svg.selectAll("*").remove();

    const margin = { top: 10, right: 10, bottom: 20, left: 30 };
    const width = +svg.attr("width") - margin.left - margin.right;
    const height = +svg.attr("height") - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain(d3.extent(countryData, d => d.year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(countryData, d => d.totalMedals)])
        .range([height, 0]);

    g.append("path")
        .datum(countryData)
        .attr("fill", "none")
        .attr("stroke", "#2a6fd6")
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(d.year))
            .y(d => y(d.totalMedals))
        );

    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(y).ticks(3));
}

// Map reset and deselection of active country
function resetZoom() {
    const resetTransform = d3.zoomIdentity.translate(0, 80);
    svg.transition()
        .duration(750)
        .call(zoom.transform, resetTransform);

    if (lastClicked) {
        const prev = d3.select(lastClicked);
        const prevIso = prev.attr('data-iso');
        const prevData = window.yearData.find(p => p.iso_code === prevIso);
        if (prevData && !isNaN(prevData.logEfficiency)) {
            prev.attr('fill', colorScale(prevData.logEfficiency));
        } else {
            const fallback = prev.attr('data-original-fill') || NOT_PARTICIPATED_COLOR;
            prev.attr('fill', fallback);
        }
        lastClicked = null;
    }
}

// Main map initialization
function initializeChoroplethMap() {
    active = d3.select(null);
    const width = 960;
    const height = 500;
    const extendedHeight = 600;

    svg = d3.select('#choroplethMap')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${extendedHeight}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '85vh')
    svg.on('click', resetZoom); 
    zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', function(event) {
    mapGroup.attr('transform', event.transform); 
    });

    svg.call(zoom);

    svg.on('click', resetZoom);
        svg.append('rect')
        .attr('x', 0)
        .attr('y', extendedHeight - 50)
        .attr('width', width)
        .attr('height', 50)
        .attr('fill', 'transparent');

    const projection = d3.geoRobinson()
        .scale(160)
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    const mapGroup = svg.append('g')
    .attr('id', 'mapGroup')
    .attr('transform', 'translate(0, 80)');

    mapGroup.append('rect')
    .attr('x', -width)
    .attr('y', -height)
    .attr('width', width * 3)
    .attr('height', height * 3)
    .attr('fill', '#f0f0f0');

    if (!worldMap || !worldMap.features || !Array.isArray(worldMap.features)) {
        console.error('Invalid GeoJSON format:', worldMap);
        return;
    }

    const countries = worldMap.features;
    console.log('World map data:', {
        features: countries.length,
        sampleFeature: countries[0]
    });

    const countryMapping = new Map();
    processedData.forEach(d => {
        if (d.iso_code && d.country) {
            countryMapping.set(d.country.toLowerCase(), d.iso_code);
        }
    });

    console.log('Country mapping sample:', Array.from(countryMapping.entries()).slice(0, 5));
    console.log('Sample processed data:', processedData.slice(0, 5));

    const idToIso = new Map();
    countries.forEach(feature => {
        if (feature.id) {
            const matchingCountry = processedData.find(d => 
                d.iso_code === feature.properties?.iso_a3 || 
                d.country.toLowerCase() === feature.properties?.name?.toLowerCase()
            );
            if (matchingCountry) {
                idToIso.set(feature.id, matchingCountry.iso_code);
            }
        }
    });

    console.log('ID to ISO mapping sample:', Array.from(idToIso.entries()).slice(0, 5));

    mapGroup.selectAll('path')
        .data(countries)
        .enter()
        .append('path')
        .attr('d', path)
        .attr('class', 'country')
        .attr('tabindex', 0)
        .attr('aria-label', function(d) {
            let iso = d.properties?.iso_a3;
            if (countryAliasMap[d.properties?.name]) {
            iso = countryAliasMap[d.properties.name];
            }
            const countryData = processedData.find(p => p.year === currentYear && p.iso_code === iso);

            if (countryData) {
                return `${countryData.country}: Medal Performance ${countryData.efficiency.toFixed(8)}, GDP per Capita $${Math.round(countryData.gdpPerCapita)}, Total Medals ${countryData.totalMedals}`;
            } else {
                return `${d.properties?.name || 'Unknown'}: No data available for ${currentYear}`;
            }
        })
        .attr('data-id', d => d.id)
        .attr('data-iso', function(d) {
            if (d.id) return d.id;
        
            const name = d.properties?.name;
            if (countryAliasMap[name]) return countryAliasMap[name];
        
            return '';
        }) 
        .attr('stroke', '#aaa')
        .attr('stroke-width', 0.6) 
        .on('mouseover', function(event, d) {
            if (!d3.select(this).classed('selected')) {
                d3.select(this)
                    .attr('stroke', 'black')
                    .attr('stroke-width', 1.2)
                    .moveToFront();
            }

            const iso = d3.select(this).attr('data-iso');
            currentlyHoveredISO = iso;
            let countryData = window.yearData.find(p => p.iso_code === iso);

            if (!countryData && iso) {
                countryData = window.yearData.find(p => p.iso_code === iso && p.year === currentYear);
              }
            const tooltip = d3.select('.tooltip');
        
            if (countryData) {
                tooltip.transition().duration(200).style('opacity', 0.9);
                tooltip.html(`
                    <strong>${countryData.country}</strong><br>
                    GDP per capita: $${countryData.gdpPerCapita.toLocaleString()}<br>
                    Total Medals: ${countryData.totalMedals}<br>
                    Medal Performance Score: ${countryData.efficiency.toFixed(8)}
                `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
                document.getElementById('ariaTooltip').textContent = 
                `${countryData.country}: ` +
                `GDP per capita $${countryData.gdpPerCapita.toLocaleString()}, ` +
                `Total Medals ${countryData.totalMedals}, ` +
                `Medal Performance Score ${countryData.efficiency.toFixed(8)}`;
                document.getElementById('ariaTooltip').textContent =
                `${d.properties?.name || 'Unknown'}: No data available for ${currentYear}`;
            }
            else {
                tooltip.transition().duration(200).style('opacity', 0.9);
                tooltip.html(`<strong>${d.properties?.name}</strong><br>No data available for ${currentYear}`);
            }
        })
        .on('mouseout', function() {
            if (!d3.select(this).classed('selected')) {
                d3.select(this)
                    .attr('stroke', '#aaa')
                    .attr('stroke-width', 0.6);
            }
            currentlyHoveredISO = null;
            d3.select('.tooltip').transition().duration(500).style('opacity', 0);
        })
        .on('click', function(event, d) {
            event.stopPropagation();  
        
            const bounds = path.bounds(d);
            const padding = 20;
            const dx = bounds[1][0] - bounds[0][0] + padding;
            const dy = bounds[1][1] - bounds[0][1] + padding;
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
        
            const scale = Math.max(1, Math.min(3, 0.9 / Math.max(dx / width, dy / height)));
            const translate = [width / 2 - scale * x, height / 2 - scale * y];
        
            svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale))
                .on('end', () => {
                    if (lastClicked && lastClicked !== this) {
                        const prev = d3.select(lastClicked);
                        const prevIso = prev.attr('data-iso');
                        const prevData = window.yearData.find(p => p.iso_code === prevIso);
                        if (prevData && !isNaN(prevData.logEfficiency)) {
                            prev.attr('fill', colorScale(prevData.logEfficiency))
                        } else {
                            const fallback = prev.attr('data-original-fill') || NOT_PARTICIPATED_COLOR;
                            prev.attr('fill', fallback)
                        }
                    }
        
                    d3.select(this).attr('fill', '#ffbf00');
        
                    lastClicked = this;
                    const iso = d3.select(this).attr('data-iso');
                    updateCountryPopup(iso);

                    const bounds = path.bounds(d);
                    const mapTransform = d3.zoomTransform(svg.node());  
                    
                    const rawX = (bounds[0][0] + bounds[1][0]) / 2;
                    const rawY = (bounds[0][1] + bounds[1][1]) / 2;
                    const x = mapTransform.applyX(rawX);
                    const y = mapTransform.applyY(rawY);
                    
                    const popupEl = document.getElementById('countryPopup');
                    popupEl.style.left = `${x + 30}px`; 
                    popupEl.style.top = `${y + 10}px`;  
                    popupEl.style.display = 'block';
                });
            active = d3.select(this);
        })
        .on('keydown', function(event, d) {
            if (event.key === 'Enter') {
              event.preventDefault();
              this.click(); 
            }
          });
    drawLegend(colorScale);
    updateChoroplethMap();
    svg.on('click', function(event) {
        if (active && !d3.select(event.target).classed('country')) {
            const iso = active.attr('data-iso');
            const fallbackData = window.yearData.find(p => p.iso_code === iso);
            const fallbackFill = fallbackData && !isNaN(fallbackData.logEfficiency)
                ? colorScale(fallbackData.logEfficiency)
                : active.attr('data-original-fill') || NOT_PARTICIPATED_COLOR;

            active
                .attr('fill', fallbackFill)
                .classed('selected', false);
    
            active = null;
    
            const resetTransform = d3.zoomIdentity.translate(0, 80);
            svg.transition()
              .duration(750)
              .call(zoom.transform, resetTransform);
        }
        document.getElementById('countryPopup').style.display = 'none';
    });
}

// Updation of choropleth colors based on selected year's data
function updateChoroplethMap() {
    window.yearData = processedData.filter(d => d.year === currentYear);
    const yearData = window.yearData;
    console.log(`Data points for year ${currentYear}:`, yearData.length);
    
    if (yearData.length === 0) {
        console.log('No data available for year:', currentYear);
        return;
    }
    const logEfficiencies = yearData.map(d => d.logEfficiency).filter(v => !isNaN(v));
    console.log('Color scale domain:', colorScale.domain());

    d3.selectAll('.country')
    .transition()                        
    .duration(600) 
    .attr('fill', function(d) {
        let iso = d3.select(this).attr('data-iso');
        const countryName = d.properties?.name;

        if (!iso || iso === 'undefined' || !window.yearData.some(p => p.iso_code === iso)) {
            const alias = countryAliasMap[countryName];
            if (alias && window.yearData.some(p => p.iso_code === alias)) {
                iso = alias;
            }
        }
    
        const countryData = window.yearData.find(p => p.iso_code === iso);
        
        const participationKey = `${iso}-${currentYear}`;
        const participated = window.participationSet.has(participationKey);

        if (!participated) {
            return NOT_PARTICIPATED_COLOR; 
        }

        if (!countryData || isNaN(countryData.logEfficiency)) {
            return NOT_PARTICIPATED_COLOR;
        }
    
        return colorScale(countryData.logEfficiency);
    })
    


    if (currentlyHoveredISO) {
        const countryData = window.yearData.find(p => p.iso_code === currentlyHoveredISO);
        const tooltip = d3.select('.tooltip');
      
        if (countryData) {
          tooltip
            .interrupt()
            .style('opacity', 0.9)
            .html(`
              <strong>${countryData.country}</strong><br>
              GDP per capita: $${countryData.gdpPerCapita.toLocaleString()}<br>
              Total Medals: ${countryData.totalMedals}<br>
              Medal Performance Score: ${countryData.efficiency.toFixed(8)}
            `);
        } else {
          tooltip
            .interrupt()
            .style('opacity', 0.9)
            .html(`<strong>${currentlyHoveredISO}</strong><br>No data available for ${currentYear}`);
        }
      }
}

// Legend
function drawLegend(colorScale) {
    d3.select('#legend').remove();

    const legendWidth = 250;
    const legendHeight = 10;

    legendGroup = d3.select('#choroplethMap svg')
    .append('g')
    .attr('id', 'legendGroup')
    .attr('transform', 'translate(280, 20)');

    const defs = legendGroup.append('defs');

    const gradient = defs.append('linearGradient')
        .attr('id', 'gradient')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '100%').attr('y2', '0%');

    const [min, max] = colorScale.domain();

    const nStops = 10;
    const step = (max - min) / (nStops - 1);

    for (let i = 0; i < nStops; i++) {
        const value = min + step * i;
        gradient.append('stop')
            .attr('offset', `${(i / (nStops - 1)) * 100}%`)
            .attr('stop-color', colorScale(value));
    }

    legendGroup.append('rect')
    .attr('x', 0)
    .attr('y', 20)
    .attr('width', 20)
    .attr('height', 10)
    .style('fill', NOT_PARTICIPATED_COLOR)
    .attr('stroke', '#999');

    legendGroup.append('text')
    .attr('x', 25)
    .attr('y', 29)
    .text('Did Not Participate')
    .attr('font-size', '12px')
    .attr('alignment-baseline', 'middle');

    legendGroup.append('rect')
        .attr('x', 150)
        .attr('y', 20)
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#gradient)');

    const axisScale = d3.scaleLinear()
        .domain([min, max])
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(axisScale)
        .ticks(5)
        .tickFormat(d => {
            const val = Math.pow(10, d);
            if (val < 0.001) return val.toFixed(7);  
            if (val < 1) return val.toFixed(4);      
            return val.toFixed(2);                   
        })

        legendGroup.append('g')
        .attr('class', 'legend-axis')
        .attr('transform', `translate(150, ${20 + legendHeight})`)
        .call(legendAxis);
    
    legendGroup.append('text')
        .attr('x', 150)
        .attr('y', 10)
        .text('Medal Performance by GDP')
        .attr('font-size', '14px');

}

function updateVisualizations() {
    updateChoroplethMap();
} 

d3.selection.prototype.moveToFront = function () {
    return this.each(function () {
      this.parentNode.appendChild(this);
    });
  };