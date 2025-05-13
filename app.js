// Initialize the map centered on MIT
const map = L.map('map').setView([42.3601, -71.0942], 15);

// Add the OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let currentMarker = null;
let isFormSubmitted = false;
let currentProject = null;
let markers = {};
let polylines = {};
let nameColors = {};
let legendControl = null;

// Add tag filter state
let selectedTags = new Set();

// Create a custom legend control
const LegendControl = L.Control.extend({
    options: {
        position: 'bottomright'
    },

    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-control leaflet-control-legend');
        container.style.backgroundColor = 'white';
        container.style.padding = '10px';
        container.style.borderRadius = '5px';
        container.style.boxShadow = '0 1px 5px rgba(0,0,0,0.2)';
        container.style.minWidth = '200px';
        container.style.maxHeight = '400px';
        container.style.overflowY = 'auto';
        
        this._container = container;
        this.update();
        return container;
    },

    update: function() {
        if (!this._container) return;
        
        // Clear existing content
        this._container.innerHTML = `
            <div class="legend-header">
                <h4>
                    People
                    <select id="nameFilter">
                        <option value="">Show All</option>
                    </select>
                </h4>
                <span style="font-size: 12px; color: #666;">Color</span>
            </div>
            <div id="tagFilter"></div>
        `;
        
        // Add entries for each name
        Object.entries(nameColors).forEach(([name, color]) => {
            const entry = L.DomUtil.create('div', 'legend-entry', this._container);
            entry.style.marginBottom = '5px';
            entry.style.display = 'flex';
            entry.style.alignItems = 'center';
            entry.style.justifyContent = 'space-between';
            
            const leftSide = L.DomUtil.create('div', 'left-side', entry);
            leftSide.style.display = 'flex';
            leftSide.style.alignItems = 'center';
            
            const colorBox = L.DomUtil.create('div', 'color-box', leftSide);
            colorBox.style.width = '15px';
            colorBox.style.height = '15px';
            colorBox.style.backgroundColor = color;
            colorBox.style.marginRight = '8px';
            colorBox.style.border = '1px solid #ccc';
            
            const nameSpan = L.DomUtil.create('span', 'name', leftSide);
            nameSpan.textContent = name;
            nameSpan.style.marginRight = '10px';
            
            // Create color picker
            const colorPicker = L.DomUtil.create('input', 'color-picker', entry);
            colorPicker.type = 'color';
            colorPicker.value = color;
            colorPicker.style.width = '30px';
            colorPicker.style.height = '20px';
            colorPicker.style.padding = '0';
            colorPicker.style.border = '1px solid #ccc';
            colorPicker.style.borderRadius = '3px';
            
            // Add change event listener
            colorPicker.addEventListener('change', (e) => {
                const newColor = e.target.value;
                nameColors[name] = newColor;
                colorBox.style.backgroundColor = newColor;
                
                // Update polyline color
                if (polylines[name]) {
                    polylines[name].setStyle({ color: newColor });
                }
                
                // Update all markers with this name
                Object.values(markers).forEach(marker => {
                    const popup = marker.getPopup();
                    const content = popup.getContent();
                    if (content.includes(`<strong>${name}</strong>`)) {
                        updateMarkerIcon(marker, name);
                    }
                });
            });
        });

        // Add event listener for name filter
        const nameFilter = document.getElementById('nameFilter');
        if (nameFilter) {
            nameFilter.addEventListener('change', function(e) {
                filterMarkersByName(e.target.value);
            });
        }

        // Update tag filter
        updateTagFilter();
    }
});

// Initialize the legend control
function initLegend() {
    if (legendControl) {
        map.removeControl(legendControl);
    }
    legendControl = new LegendControl();
    map.addControl(legendControl);
}

// Generate a random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Get or create a color for a name
function getColorForName(name) {
    if (!nameColors[name]) {
        nameColors[name] = getRandomColor();
    }
    return nameColors[name];
}

// Update polylines for a name
function updatePolylines(name) {
    // Remove existing polyline for this name
    if (polylines[name]) {
        map.removeLayer(polylines[name]);
    }

    // Get all markers for this name
    const nameMarkers = Object.values(markers).filter(marker => {
        const popup = marker.getPopup();
        const content = popup.getContent();
        return content.includes(`<strong>${name}</strong>`);
    });

    // If we have at least 2 markers, create a polyline
    if (nameMarkers.length >= 2) {
        const points = nameMarkers.map(marker => marker.getLatLng());
        const color = getColorForName(name);
        
        polylines[name] = L.polyline(points, {
            color: color,
            weight: 3,
            opacity: 0.7
        }).addTo(map);
    }

    // Update the legend
    if (legendControl) {
        legendControl.update();
    }
    
    // Update the name filter dropdown
    updateNameFilter();
}

// Project Management Functions
function loadProjects() {
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectSelect = document.getElementById('projectSelect');
    const deleteButton = document.getElementById('deleteProjectBtn');
    
    // Clear existing options except the first one
    while (projectSelect.options.length > 1) {
        projectSelect.remove(1);
    }
    
    // Add project options
    Object.keys(projects).forEach(projectName => {
        const option = document.createElement('option');
        option.value = projectName;
        option.textContent = projectName;
        projectSelect.appendChild(option);
    });

    // Update delete button state
    if (deleteButton) {
        deleteButton.disabled = !currentProject;
        deleteButton.style.opacity = currentProject ? '1' : '0.5';
        deleteButton.style.cursor = currentProject ? 'pointer' : 'not-allowed';
    }
}

function createNewProject() {
    const projectName = document.getElementById('newProjectName').value.trim();
    if (!projectName) {
        alert('Please enter a project name');
        return;
    }
    
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    if (projects[projectName]) {
        alert('Project already exists');
        return;
    }
    
    // Create new project
    projects[projectName] = [];
    localStorage.setItem('mapProjects', JSON.stringify(projects));
    
    // Clear input and reload projects
    document.getElementById('newProjectName').value = '';
    loadProjects();
    
    // Select the new project
    document.getElementById('projectSelect').value = projectName;
    loadProject(projectName);
}

// Function to create a custom marker icon
function createCustomIcon(color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background-color: ${color};
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// Function to update marker icon
function updateMarkerIcon(marker, name) {
    const color = getColorForName(name);
    marker.setIcon(createCustomIcon(color));
}

// Function to create the popup form HTML
function createPopupForm() {
    return `
        <div class="popup-form">
            <form id="markerForm">
                <div class="form-group">
                    <label for="name">Name *</label>
                    <input type="text" id="name" required>
                </div>
                <div class="form-group">
                    <label for="description">Description</label>
                    <textarea id="description" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label for="years">Year(s)</label>
                    <input type="text" id="years" placeholder="e.g., 2020-2023 or 2020">
                </div>
                <div class="form-group">
                    <label for="tags">Tags (comma-separated)</label>
                    <input type="text" id="tags" placeholder="e.g., work, personal, travel">
                </div>
                <div class="form-group">
                    <label for="image">Upload Image (JPG/PNG)</label>
                    <input type="file" id="image" accept=".jpg,.jpeg,.png">
                </div>
                <div class="button-group">
                    <button type="button" onclick="cancelMarker()">Cancel</button>
                    <button type="submit">Submit</button>
                </div>
            </form>
        </div>
    `;
}

// Function to create the marker info popup HTML
function createMarkerInfoPopup(name, description, imageUrl, years, tags) {
    let content = `<strong>${name}</strong>`;
    if (years) {
        content += `<br>Year(s): ${years}`;
    }
    if (description) {
        content += `<br>${description}`;
    }
    if (tags && tags.length > 0) {
        content += `<br>Tags: ${tags.join(', ')}`;
    }
    if (imageUrl) {
        content += `<br><img src="${imageUrl}" style="max-width: 200px; margin-top: 10px;">`;
    }
    return content;
}

// Function to handle form submission
function handleFormSubmit(event, marker) {
    event.preventDefault();
    
    const name = document.getElementById('name').value;
    const description = document.getElementById('description').value;
    const years = document.getElementById('years').value;
    const tags = document.getElementById('tags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
    const imageFile = document.getElementById('image').files[0];
    
    if (!name) {
        alert('Name is required!');
        return;
    }
    
    let imageUrl = null;
    if (imageFile) {
        imageUrl = URL.createObjectURL(imageFile);
    }
    
    // Save marker data
    saveMarker(marker, name, description, imageUrl, years, tags);
    
    // Create a new popup with the submitted information
    marker.bindPopup(createMarkerInfoPopup(name, description, imageUrl, years, tags));
    
    // Mark the form as submitted
    isFormSubmitted = true;
    
    // Add the marker to our markers object
    const latLng = marker.getLatLng();
    markers[`${latLng.lat},${latLng.lng}`] = marker;
    
    // Update marker icon with name color
    updateMarkerIcon(marker, name);
    
    // Add right-click handler for the marker
    marker.off('contextmenu');
    marker.on('contextmenu', function(e) {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        showDeleteConfirmation(marker);
    });
    
    // Update polylines for this name
    updatePolylines(name);
    
    // Synchronize tags for this person
    synchronizeTagsForPerson(name);
    
    // Open the info popup instead of closing it
    marker.openPopup();
    
    // Reset current marker state
    currentMarker = null;
}

// Function to cancel marker placement
function cancelMarker() {
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
        isFormSubmitted = false;
    }
}

// Add click event to the map
map.on('click', function(e) {
    // Check if the click was on the legend or its children
    const legendElement = document.querySelector('.leaflet-control-legend');
    if (legendElement && legendElement.contains(e.originalEvent.target)) {
        return;
    }

    if (!currentProject) {
        alert('Please select or create a project first');
        return;
    }
    
    // Only remove the temporary marker if it exists and hasn't been submitted
    if (currentMarker && !isFormSubmitted) {
        map.removeLayer(currentMarker);
    }
    
    // Reset form submission state
    isFormSubmitted = false;
    
    // Create a new marker at the clicked location
    currentMarker = L.marker(e.latlng).addTo(map);
    
    // Create and bind the popup with the form
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(createPopupForm())
        .openOn(map);
    
    // Add form submission handler
    setTimeout(() => {
        const form = document.getElementById('markerForm');
        if (form) {
            form.addEventListener('submit', (event) => handleFormSubmit(event, currentMarker));
        }
    }, 100);
});

// Handle popup close events
map.on('popupclose', function(e) {
    // If the popup is closed without submitting the form, remove the marker
    if (currentMarker && !isFormSubmitted) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

// Initialize project management
document.getElementById('projectSelect').addEventListener('change', function(e) {
    loadProject(e.target.value);
    // Update delete button state
    const deleteButton = document.getElementById('deleteProjectBtn');
    if (deleteButton) {
        deleteButton.disabled = !e.target.value;
        deleteButton.style.opacity = e.target.value ? '1' : '0.5';
        deleteButton.style.cursor = e.target.value ? 'pointer' : 'not-allowed';
    }
});

// Initialize the map and legend
initLegend();
loadProjects();

// Function to update the name filter dropdown
function updateNameFilter() {
    const nameFilter = document.getElementById('nameFilter');
    const currentValue = nameFilter.value;
    
    // Clear existing options except "Show All"
    nameFilter.innerHTML = '<option value="">Show All</option>';
    
    // Add options for each unique name
    Object.keys(nameColors).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        nameFilter.appendChild(option);
    });
    
    // Restore previous selection if it still exists
    if (currentValue && nameColors[currentValue]) {
        nameFilter.value = currentValue;
    }
}

// Function to filter markers by name
function filterMarkersByName(name) {
    // First, remove all markers and polylines from the map
    Object.values(markers).forEach(marker => marker.remove());
    Object.values(polylines).forEach(polyline => polyline.remove());

    // Then add back only the ones that match the filter
    Object.values(markers).forEach(marker => {
        const popup = marker.getPopup();
        const content = popup.getContent();
        const markerName = content.match(/<strong>(.*?)<\/strong>/)?.[1];
        
        if (!name || markerName === name) {
            marker.addTo(map);
        }
    });
    
    Object.entries(polylines).forEach(([lineName, polyline]) => {
        if (!name || lineName === name) {
            polyline.addTo(map);
        }
    });
}

// Update the loadProject function to initialize the name filter
function loadProject(projectName) {
    // Clear existing markers and polylines
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    Object.values(polylines).forEach(polyline => map.removeLayer(polyline));
    markers = {};
    polylines = {};
    nameColors = {};
    selectedTags.clear();
    
    if (!projectName) {
        currentProject = null;
        document.getElementById('nameFilter').innerHTML = '<option value="">Show All</option>';
        return;
    }
    
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[projectName] || [];
    currentProject = projectName;
    
    // Load markers for the project
    projectData.forEach(markerData => {
        const marker = L.marker([markerData.lat, markerData.lng]).addTo(map);
        marker.bindPopup(createMarkerInfoPopup(
            markerData.name,
            markerData.description,
            markerData.imageUrl,
            markerData.years,
            markerData.tags
        ));
        markers[`${markerData.lat},${markerData.lng}`] = marker;
        
        // Set marker icon with name color
        updateMarkerIcon(marker, markerData.name);
        
        // Add right-click handler for the marker
        marker.off('contextmenu');
        marker.on('contextmenu', function(e) {
            L.DomEvent.preventDefault(e);
            L.DomEvent.stopPropagation(e);
            showDeleteConfirmation(marker);
        });
    });

    // Create polylines for all names
    const names = new Set(projectData.map(data => data.name));
    names.forEach(name => updatePolylines(name));

    // Initialize or update the legend
    initLegend();
    
    // Update the name filter dropdown
    updateNameFilter();
    
    // Update tag filter
    updateTagFilter();
}

// Add event listener for name filter
document.getElementById('nameFilter').addEventListener('change', function(e) {
    filterMarkersByName(e.target.value);
});

function deleteMarker(marker) {
    if (!currentProject) return;
    
    const latLng = marker.getLatLng();
    const key = `${latLng.lat},${latLng.lng}`;
    
    // Get the name before removing the marker
    const popup = marker.getPopup();
    const content = popup.getContent();
    const nameMatch = content.match(/<strong>(.*?)<\/strong>/);
    const name = nameMatch ? nameMatch[1] : null;
    
    // Remove from map
    map.removeLayer(marker);
    delete markers[key];
    
    // Remove from localStorage
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[currentProject] || [];
    
    projects[currentProject] = projectData.filter(markerData => 
        markerData.lat !== latLng.lat || markerData.lng !== latLng.lng
    );
    
    localStorage.setItem('mapProjects', JSON.stringify(projects));

    // Update polylines for this name
    if (name) {
        updatePolylines(name);
        
        // Check if there are any remaining markers for this name
        const remainingMarkers = Object.values(markers).filter(m => {
            const mPopup = m.getPopup();
            const mContent = mPopup.getContent();
            return mContent.includes(`<strong>${name}</strong>`);
        });
        
        // If no markers remain for this name, remove it from nameColors
        if (remainingMarkers.length === 0) {
            delete nameColors[name];
        }
        
        // Update the legend
        if (legendControl) {
            legendControl.update();
        }
    }
}

function showDeleteConfirmation(marker) {
    const popup = L.popup()
        .setLatLng(marker.getLatLng())
        .setContent(`
            <div style="text-align: center; padding: 10px;">
                <p style="margin-bottom: 15px;">What would you like to do?</p>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="editMarker" style="
                        padding: 8px 15px;
                        background-color: #3498db;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: 500;
                    ">Edit Marker</button>
                    <button id="deleteMarker" style="
                        padding: 8px 15px;
                        background-color: #e74c3c;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: 500;
                    ">Delete Marker</button>
                </div>
            </div>
        `)
        .openOn(map);

    // Add event listeners after the popup is added to the DOM
    setTimeout(() => {
        document.getElementById('editMarker').addEventListener('click', () => {
            showEditForm(marker);
            popup.close();
        });
        
        document.getElementById('deleteMarker').addEventListener('click', () => {
            deleteMarker(marker);
            popup.close();
        });
    }, 100);
}

function showEditForm(marker) {
    // Get current marker data
    const popup = marker.getPopup();
    const content = popup.getContent();
    const nameMatch = content.match(/<strong>(.*?)<\/strong>/);
    const yearsMatch = content.match(/Year\(s\): (.*?)(?:<br>|$)/);
    const descriptionMatch = content.match(/<br>(.*?)(?:<br>|$)/);
    const tagsMatch = content.match(/Tags: (.*?)(?:<br>|$)/);
    
    const currentName = nameMatch ? nameMatch[1] : '';
    const currentYears = yearsMatch ? yearsMatch[1] : '';
    const currentDescription = descriptionMatch ? descriptionMatch[1] : '';
    const currentTags = tagsMatch ? tagsMatch[1] : '';
    
    // Create edit form
    const formContent = `
        <div class="popup-form">
            <form id="editMarkerForm">
                <div class="form-group">
                    <label for="editName">Name *</label>
                    <input type="text" id="editName" value="${currentName}" required>
                </div>
                <div class="form-group">
                    <label for="editDescription">Description</label>
                    <textarea id="editDescription" rows="3">${currentDescription}</textarea>
                </div>
                <div class="form-group">
                    <label for="editYears">Year(s)</label>
                    <input type="text" id="editYears" value="${currentYears}" placeholder="e.g., 2020-2023 or 2020">
                </div>
                <div class="form-group">
                    <label for="editTags">Tags (comma-separated)</label>
                    <input type="text" id="editTags" value="${currentTags}" placeholder="e.g., work, personal, travel">
                </div>
                <div class="form-group">
                    <label for="editImage">Upload New Image (JPG/PNG)</label>
                    <input type="file" id="editImage" accept=".jpg,.jpeg,.png">
                </div>
                <div class="button-group">
                    <button type="button" id="cancelEdit">Cancel</button>
                    <button type="submit">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    
    const editPopup = L.popup()
        .setLatLng(marker.getLatLng())
        .setContent(formContent)
        .openOn(map);
    
    // Add form submission handler
    setTimeout(() => {
        const form = document.getElementById('editMarkerForm');
        const cancelButton = document.getElementById('cancelEdit');
        
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                
                const newName = document.getElementById('editName').value;
                const newDescription = document.getElementById('editDescription').value;
                const newYears = document.getElementById('editYears').value;
                const newTags = document.getElementById('editTags').value
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
                const newImageFile = document.getElementById('editImage').files[0];
                
                if (!newName) {
                    alert('Name is required!');
                    return;
                }
                
                let newImageUrl = null;
                if (newImageFile) {
                    newImageUrl = URL.createObjectURL(newImageFile);
                } else {
                    // Keep existing image if no new one is uploaded
                    const existingImageMatch = content.match(/<img src="(.*?)"/);
                    if (existingImageMatch) {
                        newImageUrl = existingImageMatch[1];
                    }
                }
                
                // Update marker popup
                marker.bindPopup(createMarkerInfoPopup(newName, newDescription, newImageUrl, newYears, newTags));
                
                // Update marker icon if name changed
                if (newName !== currentName) {
                    updateMarkerIcon(marker, newName);
                }
                
                // Update localStorage
                const latLng = marker.getLatLng();
                const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
                const projectData = projects[currentProject] || [];
                
                const markerIndex = projectData.findIndex(m => 
                    m.lat === latLng.lat && m.lng === latLng.lng
                );
                
                if (markerIndex !== -1) {
                    projectData[markerIndex] = {
                        ...projectData[markerIndex],
                        name: newName,
                        description: newDescription,
                        imageUrl: newImageUrl,
                        years: newYears,
                        tags: newTags
                    };
                    
                    projects[currentProject] = projectData;
                    localStorage.setItem('mapProjects', JSON.stringify(projects));
                }
                
                // Update polylines if name changed
                if (newName !== currentName) {
                    updatePolylines(currentName);
                    updatePolylines(newName);
                }
                
                // Synchronize tags for this person
                synchronizeTagsForPerson(newName);
                
                // Close the edit popup
                map.closePopup(editPopup);
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                // Close the edit popup
                map.closePopup(editPopup);
            });
        }
    }, 100);
}

function saveMarker(marker, name, description, imageUrl, years, tags) {
    if (!currentProject) {
        alert('Please select or create a project first');
        return;
    }
    
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[currentProject] || [];
    
    const markerData = {
        lat: marker.getLatLng().lat,
        lng: marker.getLatLng().lng,
        name,
        description,
        imageUrl,
        years,
        tags
    };
    
    projectData.push(markerData);
    projects[currentProject] = projectData;
    localStorage.setItem('mapProjects', JSON.stringify(projects));
}

// Function to export the current project
function exportProject() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }

    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[currentProject] || [];
    
    // Create export data object
    const exportData = {
        projectName: currentProject,
        markers: projectData,
        nameColors: nameColors
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to import a project
function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Validate the imported data
            if (!importData.projectName || !importData.markers || !importData.nameColors) {
                throw new Error('Invalid project file format');
            }

            // Check if project already exists
            const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
            if (projects[importData.projectName]) {
                if (!confirm(`Project "${importData.projectName}" already exists. Do you want to overwrite it?`)) {
                    return;
                }
            }

            // Save the imported project
            projects[importData.projectName] = importData.markers;
            localStorage.setItem('mapProjects', JSON.stringify(projects));

            // Update nameColors
            nameColors = importData.nameColors;

            // Reload projects list
            loadProjects();

            // Select and load the imported project
            document.getElementById('projectSelect').value = importData.projectName;
            loadProject(importData.projectName);

            alert('Project imported successfully!');
        } catch (error) {
            alert('Error importing project: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset the file input
    event.target.value = '';
}

// Function to export project as GeoJSON
function exportGeoJSON() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }

    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[currentProject] || [];
    
    // Create GeoJSON FeatureCollection
    const geojson = {
        type: "FeatureCollection",
        features: []
    };

    // Add points (markers)
    projectData.forEach(markerData => {
        const feature = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [markerData.lng, markerData.lat]
            },
            properties: {
                name: markerData.name,
                description: markerData.description || "",
                imageUrl: markerData.imageUrl || null,
                type: "marker"
            }
        };
        geojson.features.push(feature);
    });

    // Add linestrings (paths)
    Object.entries(polylines).forEach(([name, polyline]) => {
        const coordinates = polyline.getLatLngs().map(latlng => [latlng.lng, latlng.lat]);
        const feature = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: coordinates
            },
            properties: {
                name: name,
                color: nameColors[name],
                type: "path"
            }
        };
        geojson.features.push(feature);
    });

    // Convert to JSON string and download
    const jsonString = JSON.stringify(geojson, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to import GeoJSON
function importGeoJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const geojson = JSON.parse(e.target.result);
            
            // Validate GeoJSON
            if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
                throw new Error('Invalid GeoJSON format');
            }

            // Ask for project name
            const projectName = prompt('Enter a name for the imported project:');
            if (!projectName) return;

            // Check if project already exists
            const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
            if (projects[projectName]) {
                if (!confirm(`Project "${projectName}" already exists. Do you want to overwrite it?`)) {
                    return;
                }
            }

            // Process features
            const markers = [];
            const nameColors = {};

            geojson.features.forEach(feature => {
                if (feature.type === "Feature") {
                    if (feature.geometry.type === "Point") {
                        // Process marker
                        const coords = feature.geometry.coordinates;
                        const props = feature.properties;
                        
                        markers.push({
                            lat: coords[1],
                            lng: coords[0],
                            name: props.name,
                            description: props.description || "",
                            imageUrl: props.imageUrl || null
                        });
                    } else if (feature.geometry.type === "LineString") {
                        // Process path
                        const props = feature.properties;
                        if (props.name && props.color) {
                            nameColors[props.name] = props.color;
                        }
                    }
                }
            });

            // Save the project
            projects[projectName] = markers;
            localStorage.setItem('mapProjects', JSON.stringify(projects));

            // Update nameColors
            Object.assign(nameColors, nameColors);

            // Reload projects list
            loadProjects();

            // Select and load the imported project
            document.getElementById('projectSelect').value = projectName;
            loadProject(projectName);

            alert('GeoJSON project imported successfully!');
        } catch (error) {
            alert('Error importing GeoJSON: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset the file input
    event.target.value = '';
}

// Function to update the tag filter panel
function updateTagFilter() {
    const tagFilterContainer = document.getElementById('tagFilter');
    if (!tagFilterContainer) return;

    // Get all unique tags from markers
    const allTags = new Set();
    Object.values(markers).forEach(marker => {
        const popup = marker.getPopup();
        const content = popup.getContent();
        const tagsMatch = content.match(/Tags: (.*?)(?:<br>|$)/);
        if (tagsMatch) {
            const tags = tagsMatch[1].split(',').map(tag => tag.trim());
            tags.forEach(tag => allTags.add(tag));
        }
    });

    // Create tag filter HTML
    let tagFilterHTML = '<div class="tag-filter-section">';
    tagFilterHTML += '<h4>Filter by Tags</h4>';
    tagFilterHTML += '<div class="tag-filters">';
    
    allTags.forEach(tag => {
        const isSelected = selectedTags.has(tag);
        tagFilterHTML += `
            <div class="tag-filter-item">
                <input type="checkbox" id="tag-${tag}" 
                    ${isSelected ? 'checked' : ''} 
                    onchange="toggleTagFilter('${tag}')">
                <label for="tag-${tag}">${tag}</label>
            </div>
        `;
    });
    
    tagFilterHTML += '</div></div>';
    tagFilterContainer.innerHTML = tagFilterHTML;
}

// Function to toggle tag filter
function toggleTagFilter(tag) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
    } else {
        selectedTags.add(tag);
    }
    filterMarkersByTags();
}

// Function to filter markers by tags
function filterMarkersByTags() {
    if (selectedTags.size === 0) {
        // Show all markers if no tags are selected
        Object.values(markers).forEach(marker => marker.addTo(map));
        Object.values(polylines).forEach(polyline => polyline.addTo(map));
        return;
    }

    // First, remove all markers and polylines
    Object.values(markers).forEach(marker => marker.remove());
    Object.values(polylines).forEach(polyline => polyline.remove());

    // Then add back only markers that match the selected tags
    Object.values(markers).forEach(marker => {
        const popup = marker.getPopup();
        const content = popup.getContent();
        const tagsMatch = content.match(/Tags: (.*?)(?:<br>|$)/);
        
        if (tagsMatch) {
            const markerTags = tagsMatch[1].split(',').map(tag => tag.trim());
            const hasSelectedTag = markerTags.some(tag => selectedTags.has(tag));
            
            if (hasSelectedTag) {
                marker.addTo(map);
            }
        }
    });

    // Update polylines for visible markers
    Object.entries(polylines).forEach(([name, polyline]) => {
        const hasVisibleMarkers = Object.values(markers).some(marker => {
            if (!marker.getLatLng) return false;
            const popup = marker.getPopup();
            const content = popup.getContent();
            return content.includes(`<strong>${name}</strong>`) && marker.getLatLng();
        });
        
        if (hasVisibleMarkers) {
            polyline.addTo(map);
        }
    });
}

// Function to synchronize tags for a person
function synchronizeTagsForPerson(name) {
    if (!currentProject) return;
    
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    const projectData = projects[currentProject] || [];
    
    // Update tags for all markers with the same name
    projectData.forEach(markerData => {
        if (markerData.name === name) {
            markerData.tags = selectedTags.has(name) ? [name] : [];
        }
    });
    
    projects[currentProject] = projectData;
    localStorage.setItem('mapProjects', JSON.stringify(projects));
}

// Function to delete the current project
function deleteProject() {
    if (!currentProject) {
        alert('No project selected');
        return;
    }

    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }

    // Get projects from localStorage
    const projects = JSON.parse(localStorage.getItem('mapProjects')) || {};
    
    // Delete the current project
    delete projects[currentProject];
    
    // Save updated projects
    localStorage.setItem('mapProjects', JSON.stringify(projects));
    
    // Clear the map
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    Object.values(polylines).forEach(polyline => map.removeLayer(polyline));
    markers = {};
    polylines = {};
    nameColors = {};
    
    // Reset current project
    currentProject = null;
    
    // Update project dropdown
    loadProjects();
    
    // Update legend
    initLegend();
    
    // Show success message
    alert('Project deleted successfully');
} 