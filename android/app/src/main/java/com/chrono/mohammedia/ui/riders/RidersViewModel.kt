package com.chrono.mohammedia.ui.riders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.chrono.mohammedia.data.model.FilterType
import com.chrono.mohammedia.data.model.HubSummary
import com.chrono.mohammedia.data.model.RiderItem
import com.chrono.mohammedia.data.repository.RiderRepository
import kotlinx.coroutines.launch

class RidersViewModel(
    application: Application
) : AndroidViewModel(application) {

    val repository: RiderRepository = RiderRepository.getInstance(application)

    private val _riders = MutableLiveData<List<RiderItem>>()
    val riders: LiveData<List<RiderItem>> = _riders

    private val _hubSummary = MutableLiveData<HubSummary>()
    val hubSummary: LiveData<HubSummary> = _hubSummary

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    private val _currentFilter = MutableLiveData(FilterType.ALL)
    val currentFilter: LiveData<FilterType> = _currentFilter

    private val _errorMessage = MutableLiveData<String?>()
    val errorMessage: LiveData<String?> = _errorMessage

    private var currentQuery: String = ""

    init {
        repository.loadPreferences(application)
        if (repository.hasCachedData()) {
            _riders.value = repository.getCachedRidersSync(currentQuery, _currentFilter.value ?: FilterType.ALL)
            _hubSummary.value = repository.getCachedHubSummarySync()
            _isLoading.value = false
        }
        if (repository.hasValidSavedSession()) {
            loadData(isBackgroundSync = repository.hasCachedData())
        }
    }

    private var loadJob: kotlinx.coroutines.Job? = null

    fun loadData(isBackgroundSync: Boolean = false) {
        if (_isLoading.value == true && loadJob?.isActive == true) {
            return
        }
        loadJob = viewModelScope.launch {
            if (!isBackgroundSync) {
                _isLoading.value = true
            }
            try {
                val result = repository.refreshData(onProgress = {
                    val list = repository.getCachedRidersSync(
                        query = currentQuery,
                        filter = _currentFilter.value ?: FilterType.ALL
                    )
                    _riders.postValue(list)
                    _hubSummary.postValue(repository.getCachedHubSummarySync())
                })

                if (result.isSuccess) {
                    _errorMessage.value = null
                } else {
                    val ex = result.exceptionOrNull()
                    if (!repository.hasCachedData()) {
                        _errorMessage.value = ex?.localizedMessage ?: "Erreur de synchronisation API"
                    }
                }
                val list = repository.getCachedRidersSync(
                    query = currentQuery,
                    filter = _currentFilter.value ?: FilterType.ALL
                )
                _riders.value = list
                _hubSummary.value = repository.getCachedHubSummarySync()
            } catch (e: Exception) {
                if (!repository.hasCachedData()) {
                    _errorMessage.value = e.localizedMessage ?: "Erreur de connexion"
                }
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun setFilter(filter: FilterType) {
        if (_currentFilter.value != filter) {
            _currentFilter.value = filter
            _riders.value = repository.getCachedRidersSync(currentQuery, filter)
            _hubSummary.value = repository.getCachedHubSummarySync()
        }
    }

    fun setSearchQuery(query: String) {
        currentQuery = query
        _riders.value = repository.getCachedRidersSync(query, _currentFilter.value ?: FilterType.ALL)
    }

    fun refresh() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _isLoading.value = true
            try {
                val result = repository.refreshData(onProgress = {
                    val list = repository.getCachedRidersSync(
                        query = currentQuery,
                        filter = _currentFilter.value ?: FilterType.ALL
                    )
                    _riders.postValue(list)
                    _hubSummary.postValue(repository.getCachedHubSummarySync())
                })
                if (result.isSuccess) {
                    _errorMessage.value = null
                } else {
                    val ex = result.exceptionOrNull()
                    _errorMessage.value = ex?.localizedMessage ?: "Erreur de synchronisation API"
                }
                val list = repository.getCachedRidersSync(
                    query = currentQuery,
                    filter = _currentFilter.value ?: FilterType.ALL
                )
                _riders.value = list
                _hubSummary.value = repository.getCachedHubSummarySync()
            } catch (e: Exception) {
                _errorMessage.value = e.localizedMessage ?: "Erreur de connexion"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun login(
        username: String,
        password: String,
        orgId: String,
        hubId: String,
        context: android.content.Context,
        onResult: (Boolean, String?) -> Unit
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val result = repository.loginWithPlaintext(
                    username = username,
                    plaintextPassword = password,
                    orgId = orgId,
                    hubId = hubId,
                    rememberMe = true,
                    context = context
                )
                if (result.isSuccess) {
                    _errorMessage.value = null
                    onResult(true, null)
                } else {
                    val ex = result.exceptionOrNull()
                    val err = ex?.localizedMessage ?: "Échec d'authentification"
                    _errorMessage.value = err
                    onResult(false, err)
                }
            } catch (e: Exception) {
                val err = e.localizedMessage ?: "Erreur de connexion"
                _errorMessage.value = err
                onResult(false, err)
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun autoLogin(context: android.content.Context, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val result = repository.performAutoLogin(context)
                if (result.isSuccess) {
                    _errorMessage.value = null
                    refresh()
                    onResult(true, null)
                } else {
                    val ex = result.exceptionOrNull()
                    val err = ex?.localizedMessage ?: "Échec de connexion"
                    _errorMessage.value = err
                    onResult(false, err)
                }
            } catch (e: Exception) {
                val err = e.localizedMessage ?: "Erreur de connexion"
                _errorMessage.value = err
                onResult(false, err)
            } finally {
                _isLoading.value = false
            }
        }
    }
}


